import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: 'GetCommand', input })),
  QueryCommand: vi.fn((input: unknown) => ({ _type: 'QueryCommand', input })),
}));

function makeEvent(statementId: string | null, sub = 'user-123'): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    pathParameters: statementId ? { statementId } : null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'req-1',
      authorizer: { claims: { sub } },
    } as unknown as APIGatewayProxyEvent['requestContext'],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/statements/abc',
    resource: '/statements/{statementId}',
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe('review-statement handler', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    vi.stubEnv('STATEMENTS_TABLE_NAME', 'laskifin-Statements');
    vi.stubEnv('TABLE_NAME', 'laskifin-Ledger');
    vi.stubEnv('CORS_ORIGIN', '*');
  });

  it('returns 400 when statementId is missing', async () => {
    const { handler } = await import('../../src/statements/review-statement.js');
    const result = await handler(makeEvent(null));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when the statement does not belong to the user', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const { handler } = await import('../../src/statements/review-statement.js');
    const result = await handler(makeEvent('stmt-1'));
    expect(result.statusCode).toBe(404);
  });

  it('enriches the statement with a duplicates array', async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          pk: 'USER#user-123',
          sk: 'STATEMENT#stmt-1',
          statementId: 'stmt-1',
          status: 'done',
          extractedTransactions: [
            { date: '2026-04-20', description: 'NETFLIX', amount: 50, type: 'EXP', source: 'itau-black-1509', category: 'serviços' },
            { date: '2026-04-20', description: 'SPOTIFY', amount: 30, type: 'EXP', source: 'itau-black-1509', category: 'serviços' },
          ],
        },
      })
      // hash query #1 returns a match (duplicate)
      .mockResolvedValueOnce({ Items: [{ sk: 'TRANS#2026-04#EXP#existing-a' }] })
      // hash query #2 returns no match (new row)
      .mockResolvedValueOnce({ Items: [] });

    const { handler } = await import('../../src/statements/review-statement.js');
    const result = await handler(makeEvent('stmt-1'));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.statementId).toBe('stmt-1');
    expect(body.duplicates).toEqual([
      { index: 0, matchedLedgerSk: 'TRANS#2026-04#EXP#existing-a' },
    ]);
  });

  it('returns empty duplicates for a draft with no drafts yet', async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        pk: 'USER#user-123',
        sk: 'STATEMENT#stmt-1',
        statementId: 'stmt-1',
        status: 'processing',
      },
    });

    const { handler } = await import('../../src/statements/review-statement.js');
    const result = await handler(makeEvent('stmt-1'));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.duplicates).toEqual([]);
  });

  it('scopes the lookup by the caller pk (user isolation)', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const { handler } = await import('../../src/statements/review-statement.js');
    await handler(makeEvent('stmt-1', 'attacker'));

    const getCall = mockSend.mock.calls[0][0];
    expect(getCall.input.Key.pk).toBe('USER#attacker');
    expect(getCall.input.Key.sk).toBe('STATEMENT#stmt-1');
  });
});
