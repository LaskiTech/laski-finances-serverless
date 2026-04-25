import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = vi.fn();
const mockS3Send = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: 'GetCommand', input })),
  DeleteCommand: vi.fn((input: unknown) => ({ _type: 'DeleteCommand', input })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  DeleteObjectCommand: vi.fn((input: unknown) => ({ _type: 'DeleteObjectCommand', input })),
}));

function makeEvent(statementId: string | null, sub = 'user-123'): APIGatewayProxyEvent {
  return {
    httpMethod: 'DELETE',
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

describe('delete-statement handler', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    mockS3Send.mockReset();
    vi.stubEnv('STATEMENTS_TABLE_NAME', 'laskifin-Statements');
    vi.stubEnv('STATEMENTS_BUCKET_NAME', 'laskifin-statements-bucket');
    vi.stubEnv('CORS_ORIGIN', '*');
  });

  it('returns 400 when statementId is missing', async () => {
    const { handler } = await import('../../src/statements/delete-statement.js');
    const result = await handler(makeEvent(null));
    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when statement does not exist', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const { handler } = await import('../../src/statements/delete-statement.js');
    const result = await handler(makeEvent('stmt-404'));
    expect(result.statusCode).toBe(404);
  });

  it('refuses to delete a statement that is still processing (409)', async () => {
    mockSend.mockResolvedValueOnce({
      Item: { pk: 'USER#user-123', sk: 'STATEMENT#stmt-p', status: 'processing', s3Key: 'statements/user-123/stmt-p.pdf' },
    });
    const { handler } = await import('../../src/statements/delete-statement.js');
    const result = await handler(makeEvent('stmt-p'));
    expect(result.statusCode).toBe(409);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('deletes S3 object then DDB record', async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: { pk: 'USER#user-123', sk: 'STATEMENT#stmt-ok', status: 'done', s3Key: 'statements/user-123/stmt-ok.pdf' },
      })
      .mockResolvedValueOnce({}); // DeleteCommand
    mockS3Send.mockResolvedValueOnce({}); // S3 delete

    const { handler } = await import('../../src/statements/delete-statement.js');
    const result = await handler(makeEvent('stmt-ok'));
    expect(result.statusCode).toBe(200);

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const s3Call = mockS3Send.mock.calls[0][0];
    expect(s3Call.input.Key).toBe('statements/user-123/stmt-ok.pdf');

    const deleteCall = mockSend.mock.calls[1][0];
    expect(deleteCall.input.Key.pk).toBe('USER#user-123');
    expect(deleteCall.input.Key.sk).toBe('STATEMENT#stmt-ok');
  });

  it('continues with DDB delete if S3 delete fails', async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: { pk: 'USER#user-123', sk: 'STATEMENT#stmt-x', status: 'error', s3Key: 'statements/user-123/stmt-x.pdf' },
      })
      .mockResolvedValueOnce({});
    mockS3Send.mockRejectedValueOnce(new Error('NoSuchKey'));

    const { handler } = await import('../../src/statements/delete-statement.js');
    const result = await handler(makeEvent('stmt-x'));
    expect(result.statusCode).toBe(200);
  });
});
