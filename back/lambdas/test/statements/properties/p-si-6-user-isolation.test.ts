// Feature: statement-import, Property 6: User isolation across all Statement endpoints
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: 'GetCommand', input })),
  QueryCommand: vi.fn((input: unknown) => ({ _type: 'QueryCommand', input })),
  DeleteCommand: vi.fn((input: unknown) => ({ _type: 'DeleteCommand', input })),
  PutCommand: vi.fn((input: unknown) => ({ _type: 'PutCommand', input })),
  BatchWriteCommand: vi.fn((input: unknown) => ({ _type: 'BatchWriteCommand', input })),
  UpdateCommand: vi.fn((input: unknown) => ({ _type: 'UpdateCommand', input })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: vi.fn() })),
  DeleteObjectCommand: vi.fn((input: unknown) => ({ _type: 'DeleteObjectCommand', input })),
}));

function makeEvent(
  statementId: string,
  sub: string,
  method: string,
  body: unknown = null,
): APIGatewayProxyEvent {
  return {
    httpMethod: method,
    body: body !== null ? JSON.stringify(body) : null,
    pathParameters: { statementId },
    queryStringParameters: null,
    requestContext: {
      requestId: 'req-1',
      authorizer: { claims: { sub } },
    } as unknown as APIGatewayProxyEvent['requestContext'],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/statements/${statementId}`,
    resource: '/statements/{statementId}',
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

const subArb = fc.stringMatching(/^[a-z0-9]{4,12}$/);
const statementIdArb = fc.stringMatching(/^stmt-[a-z0-9]{4,10}$/);

describe('P-SI-6 user isolation across endpoints', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    vi.stubEnv('STATEMENTS_TABLE_NAME', 'laskifin-Statements');
    vi.stubEnv('STATEMENTS_BUCKET_NAME', 'laskifin-statements-bucket');
    vi.stubEnv('TABLE_NAME', 'laskifin-Ledger');
    vi.stubEnv('LINKS_TABLE_NAME', 'laskifin-Links');
    vi.stubEnv('SUMMARY_TABLE_NAME', 'laskifin-MonthlySummary');
    vi.stubEnv('CORS_ORIGIN', '*');
  });

  it('review-statement returns 404 when the caller is not the owner', async () => {
    const { handler } = await import('../../../src/statements/review-statement.js');
    await fc.assert(
      fc.asyncProperty(subArb, subArb, statementIdArb, async (owner, attacker, statementId) => {
        fc.pre(owner !== attacker);
        mockSend.mockReset();
        // Simulate DDB returning no Item for attacker's pk scoping.
        mockSend.mockResolvedValueOnce({ Item: undefined });

        const result = await handler(makeEvent(statementId, attacker, 'GET'));
        const getCall = mockSend.mock.calls[0][0];
        return (
          result.statusCode === 404 &&
          getCall.input.Key.pk === `USER#${attacker}` &&
          getCall.input.Key.pk !== `USER#${owner}`
        );
      }),
      { numRuns: 100 },
    );
    expect(true).toBe(true);
  });

  it('delete-statement returns 404 when the caller is not the owner', async () => {
    const { handler } = await import('../../../src/statements/delete-statement.js');
    await fc.assert(
      fc.asyncProperty(subArb, subArb, statementIdArb, async (owner, attacker, statementId) => {
        fc.pre(owner !== attacker);
        mockSend.mockReset();
        mockSend.mockResolvedValueOnce({ Item: undefined });

        const result = await handler(makeEvent(statementId, attacker, 'DELETE'));
        return result.statusCode === 404;
      }),
      { numRuns: 100 },
    );
    expect(true).toBe(true);
  });

  it('confirm-statement-import returns 404 when the caller is not the owner', async () => {
    const { handler } = await import('../../../src/statements/confirm-statement-import.js');
    await fc.assert(
      fc.asyncProperty(subArb, subArb, statementIdArb, async (owner, attacker, statementId) => {
        fc.pre(owner !== attacker);
        mockSend.mockReset();
        mockSend.mockResolvedValueOnce({ Item: undefined });

        const result = await handler(makeEvent(statementId, attacker, 'POST', {
          selectedIndices: [0],
          acceptedReconciliationIds: [],
        }));
        return result.statusCode === 404;
      }),
      { numRuns: 100 },
    );
    expect(true).toBe(true);
  });

  it('list-statements scopes the Query to the caller pk', async () => {
    const { handler } = await import('../../../src/statements/list-statements.js');
    await fc.assert(
      fc.asyncProperty(subArb, async (sub) => {
        mockSend.mockReset();
        mockSend.mockResolvedValueOnce({ Items: [] });
        await handler({
          httpMethod: 'GET',
          body: null,
          pathParameters: null,
          queryStringParameters: null,
          requestContext: {
            requestId: 'r',
            authorizer: { claims: { sub } },
          } as unknown as APIGatewayProxyEvent['requestContext'],
          headers: {},
          multiValueHeaders: {},
          isBase64Encoded: false,
          path: '/statements',
          resource: '/statements',
          stageVariables: null,
          multiValueQueryStringParameters: null,
        } as APIGatewayProxyEvent);
        const call = mockSend.mock.calls[0][0];
        return call.input.ExpressionAttributeValues[':pk'] === `USER#${sub}`;
      }),
      { numRuns: 100 },
    );
    expect(true).toBe(true);
  });
});
