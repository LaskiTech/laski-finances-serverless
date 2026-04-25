import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: 'GetCommand', input })),
  PutCommand: vi.fn((input: unknown) => ({ _type: 'PutCommand', input })),
  BatchWriteCommand: vi.fn((input: unknown) => ({ _type: 'BatchWriteCommand', input })),
  UpdateCommand: vi.fn((input: unknown) => ({ _type: 'UpdateCommand', input })),
  QueryCommand: vi.fn((input: unknown) => ({ _type: 'QueryCommand', input })),
}));

function makeEvent(
  statementId: string,
  body: unknown,
  sub = 'user-123',
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    pathParameters: { statementId },
    queryStringParameters: null,
    requestContext: {
      requestId: 'req-1',
      authorizer: { claims: { sub } },
    } as unknown as APIGatewayProxyEvent['requestContext'],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/statements/${statementId}/confirm`,
    resource: '/statements/{statementId}/confirm',
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

function stmtItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Item: {
      pk: 'USER#user-123',
      sk: 'STATEMENT#stmt-1',
      statementId: 'stmt-1',
      status: 'done',
      extractedTransactions: [
        {
          date: '2026-04-05',
          description: 'NETFLIX.COM',
          amount: 50,
          type: 'EXP',
          source: 'itau-black-1509',
          category: 'serviços',
        },
        {
          date: '2026-04-06',
          description: 'SPOTIFY',
          amount: 30,
          type: 'EXP',
          source: 'itau-black-1509',
          category: 'serviços',
        },
      ],
      reconciliationCandidates: [],
      ...overrides,
    },
  };
}

describe('confirm-statement-import handler', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    vi.stubEnv('STATEMENTS_TABLE_NAME', 'laskifin-Statements');
    vi.stubEnv('TABLE_NAME', 'laskifin-Ledger');
    vi.stubEnv('SUMMARY_TABLE_NAME', 'laskifin-MonthlySummary');
    vi.stubEnv('LINKS_TABLE_NAME', 'laskifin-Links');
    vi.stubEnv('CORS_ORIGIN', '*');
  });

  it('imports selected rows, updates summaries, flips status to imported', async () => {
    mockSend
      .mockResolvedValueOnce(stmtItem()) // GetCommand stmt
      // batchQueryLedgerByImportHash: 2 rows → 2 queries, both empty
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] })
      // BatchWriteCommand
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      // 2 × MonthlySummary updates
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      // UpdateCommand stmt
      .mockResolvedValueOnce({});

    const { handler } = await import('../../src/statements/confirm-statement-import.js');
    const result = await handler(makeEvent('stmt-1', {
      selectedIndices: [0, 1],
      acceptedReconciliationIds: [],
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.imported).toBe(2);
    expect(body.skipped).toEqual([]);
    expect(body.linked).toBe(0);

    const batchCall = mockSend.mock.calls.find((c) => c[0]._type === 'BatchWriteCommand');
    expect(batchCall).toBeDefined();
    const items = batchCall![0].input.RequestItems['laskifin-Ledger'];
    expect(items).toHaveLength(2);
    const firstItem = items[0].PutRequest.Item;
    expect(firstItem.pk).toBe('USER#user-123');
    expect(firstItem.sk).toMatch(/^TRANS#2026-04#EXP#/);
    expect(firstItem.importHash).toMatch(/^[0-9a-f]{64}$/);
    expect(firstItem.categoryMonth).toBe('serviços#2026-04');
    expect(firstItem.sourceStatementId).toBe('stmt-1');

    const stmtUpdate = mockSend.mock.calls
      .map((c) => c[0])
      .find((c) => c._type === 'UpdateCommand' && c.input.TableName === 'laskifin-Statements');
    expect(stmtUpdate!.input.UpdateExpression).toMatch(/REMOVE extractedTransactions/);
    expect(stmtUpdate!.input.ExpressionAttributeValues[':imported']).toBe('imported');
    expect(stmtUpdate!.input.ExpressionAttributeValues[':n']).toBe(2);
  });

  it('skips duplicates detected via importHash match', async () => {
    mockSend
      .mockResolvedValueOnce(stmtItem())
      .mockResolvedValueOnce({ Items: [{ sk: 'TRANS#2026-04#EXP#dup' }] }) // idx 0 duplicate
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ UnprocessedItems: {} }) // batchWrite of 1 item
      .mockResolvedValueOnce({}) // summary
      .mockResolvedValueOnce({}); // update stmt

    const { handler } = await import('../../src/statements/confirm-statement-import.js');
    const result = await handler(makeEvent('stmt-1', {
      selectedIndices: [0, 1],
      acceptedReconciliationIds: [],
    }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.imported).toBe(1);
    expect(body.skipped).toEqual([{ index: 0, matchedSk: 'TRANS#2026-04#EXP#dup' }]);
  });

  it('returns 400 when selectedIndices is empty', async () => {
    const { handler } = await import('../../src/statements/confirm-statement-import.js');
    const result = await handler(makeEvent('stmt-1', {
      selectedIndices: [],
      acceptedReconciliationIds: [],
    }));
    expect(result.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns 400 when a selectedIndex is out of bounds', async () => {
    mockSend.mockResolvedValueOnce(stmtItem());
    const { handler } = await import('../../src/statements/confirm-statement-import.js');
    const result = await handler(makeEvent('stmt-1', {
      selectedIndices: [0, 99],
      acceptedReconciliationIds: [],
    }));
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toMatch(/out of bounds/);
  });

  it('returns 404 when the statement belongs to another user', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const { handler } = await import('../../src/statements/confirm-statement-import.js');
    const result = await handler(makeEvent('stmt-1', {
      selectedIndices: [0],
      acceptedReconciliationIds: [],
    }));
    expect(result.statusCode).toBe(404);
  });

  it('normalizes category and source to lowercase before writing', async () => {
    mockSend
      .mockResolvedValueOnce(stmtItem({
        extractedTransactions: [{
          date: '2026-04-05',
          description: 'X',
          amount: 10,
          type: 'EXP',
          source: '  ITAU-BLACK-1509  ',
          category: '  Serviços  ',
        }],
      }))
      .mockResolvedValueOnce({ Items: [] }) // dedup query
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      .mockResolvedValueOnce({}) // summary
      .mockResolvedValueOnce({}); // update stmt

    const { handler } = await import('../../src/statements/confirm-statement-import.js');
    await handler(makeEvent('stmt-1', {
      selectedIndices: [0],
      acceptedReconciliationIds: [],
    }));

    const batchCall = mockSend.mock.calls.find((c) => c[0]._type === 'BatchWriteCommand');
    const written = batchCall![0].input.RequestItems['laskifin-Ledger'][0].PutRequest.Item;
    expect(written.source).toBe('itau-black-1509');
    expect(written.category).toBe('serviços');
  });

  it('treats ConditionalCheckFailedException on Link as success (idempotent)', async () => {
    mockSend
      .mockResolvedValueOnce(stmtItem({
        extractedTransactions: [{
          date: '2026-04-20',
          description: 'ITAU BLACK 3102-2305',
          amount: 9181.49,
          type: 'EXP',
          source: 'itau-corrente-9670-00293-1',
          category: 'uncategorized',
        }],
        reconciliationCandidates: [{
          candidateId: 'cand-1',
          confidence: 'high',
          parentSk: 'TRANS#2026-04#EXP#external',
          childStatementId: 'stmt-1',
          childCount: 1,
          totalAmount: 9181.49,
          dateWindow: { from: '2026-04-17', to: '2026-04-23' },
        }],
      }))
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      .mockResolvedValueOnce({})
      .mockImplementationOnce(() => {
        const err = new Error('exists');
        err.name = 'ConditionalCheckFailedException';
        return Promise.reject(err);
      })
      .mockResolvedValueOnce({});

    const { handler } = await import('../../src/statements/confirm-statement-import.js');
    const result = await handler(makeEvent('stmt-1', {
      selectedIndices: [0],
      acceptedReconciliationIds: ['cand-1'],
    }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.linked).toBe(1);
    expect(body.linkFailed).toEqual([]);
  });
});
