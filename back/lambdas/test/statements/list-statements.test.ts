import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  QueryCommand: vi.fn((input: unknown) => ({ _type: 'QueryCommand', input })),
}));

function makeEvent(query: Record<string, string> | null = null, sub = 'user-123'): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    pathParameters: null,
    queryStringParameters: query,
    requestContext: {
      requestId: 'req-1',
      authorizer: { claims: { sub } },
    } as unknown as APIGatewayProxyEvent['requestContext'],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/statements',
    resource: '/statements',
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe('list-statements handler', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    vi.stubEnv('STATEMENTS_TABLE_NAME', 'laskifin-Statements');
    vi.stubEnv('CORS_ORIGIN', '*');
  });

  it('omits extractedTransactions from the returned items', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          pk: 'USER#user-123',
          sk: 'STATEMENT#a',
          statementId: 'a',
          status: 'done',
          createdAt: '2026-04-20T00:00:00Z',
          extractedTransactions: [{ description: 'heavy' }],
        },
      ],
    });

    const { handler } = await import('../../src/statements/list-statements.js');
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].extractedTransactions).toBeUndefined();
    expect(body.items[0].statementId).toBe('a');
  });

  it('sorts items by createdAt desc', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { statementId: 'old', createdAt: '2026-01-01T00:00:00Z' },
        { statementId: 'new', createdAt: '2026-04-20T00:00:00Z' },
        { statementId: 'mid', createdAt: '2026-02-15T00:00:00Z' },
      ],
    });
    const { handler } = await import('../../src/statements/list-statements.js');
    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.items.map((i: { statementId: string }) => i.statementId)).toEqual(['new', 'mid', 'old']);
  });

  it('encodes and decodes the pagination cursor', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ statementId: 'x', createdAt: '2026-04-20T00:00:00Z' }],
      LastEvaluatedKey: { pk: 'USER#user-123', sk: 'STATEMENT#x' },
    });

    const { handler } = await import('../../src/statements/list-statements.js');
    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(typeof body.nextCursor).toBe('string');
    const decoded = JSON.parse(Buffer.from(body.nextCursor as string, 'base64url').toString('utf8'));
    expect(decoded).toEqual({ pk: 'USER#user-123', sk: 'STATEMENT#x' });
  });

  it('returns 400 on an invalid cursor', async () => {
    const { handler } = await import('../../src/statements/list-statements.js');
    const result = await handler(makeEvent({ cursor: '!!!not-base64-json!!!' }));
    expect(result.statusCode).toBe(400);
  });

  it('scopes the query to the caller pk (user isolation)', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const { handler } = await import('../../src/statements/list-statements.js');
    await handler(makeEvent(null, 'other-user'));

    const call = mockSend.mock.calls[0][0];
    expect(call.input.ExpressionAttributeValues[':pk']).toBe('USER#other-user');
  });
});
