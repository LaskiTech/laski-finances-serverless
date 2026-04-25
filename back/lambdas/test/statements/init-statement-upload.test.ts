import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const mockSend = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  PutCommand: vi.fn((input: unknown) => ({ _type: 'PutCommand', input })),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({})),
  PutObjectCommand: vi.fn((input: unknown) => ({ _type: 'PutObjectCommand', input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

function makeEvent(body: unknown, sub = 'user-123'): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: null,
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

describe('init-statement-upload handler', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSend.mockReset();
    mockGetSignedUrl.mockReset();
    vi.stubEnv('STATEMENTS_TABLE_NAME', 'laskifin-Statements');
    vi.stubEnv('STATEMENTS_BUCKET_NAME', 'laskifin-statements-bucket');
    vi.stubEnv('CORS_ORIGIN', '*');
  });

  it('returns 202 with a presigned URL for a valid request', async () => {
    mockSend.mockResolvedValueOnce({});
    mockGetSignedUrl.mockResolvedValueOnce('https://example.com/signed');

    const { handler } = await import('../../src/statements/init-statement-upload.js');
    const result = await handler(makeEvent({
      filename: 'fatura.pdf',
      contentType: 'application/pdf',
      documentType: 'CREDIT_CARD',
      bank: 'ITAU',
    }));

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body);
    expect(body.statementId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.uploadUrl).toBe('https://example.com/signed');
    expect(body.maxBytes).toBe(10 * 1024 * 1024);
    expect(body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns 401 when caller has no auth claim', async () => {
    const { handler } = await import('../../src/statements/init-statement-upload.js');
    const event = makeEvent({ filename: 'x.pdf', contentType: 'application/pdf', documentType: 'CREDIT_CARD', bank: 'ITAU' });
    event.requestContext.authorizer = undefined as unknown as APIGatewayProxyEvent['requestContext']['authorizer'];
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 on invalid contentType', async () => {
    const { handler } = await import('../../src/statements/init-statement-upload.js');
    const result = await handler(makeEvent({
      filename: 'fatura.xyz',
      contentType: 'image/png',
      documentType: 'CREDIT_CARD',
      bank: 'ITAU',
    }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 on malformed JSON', async () => {
    const { handler } = await import('../../src/statements/init-statement-upload.js');
    const result = await handler(makeEvent('not-json'));
    expect(result.statusCode).toBe(400);
  });

  it('writes an S3 key scoped to the calling userId', async () => {
    mockSend.mockResolvedValueOnce({});
    mockGetSignedUrl.mockResolvedValueOnce('https://example.com/signed');

    const { handler } = await import('../../src/statements/init-statement-upload.js');
    await handler(makeEvent({
      filename: 'extrato.pdf',
      contentType: 'application/pdf',
      documentType: 'BANK_ACCOUNT',
      bank: 'ITAU',
    }, 'user-abc'));

    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.input.Item.pk).toBe('USER#user-abc');
    expect(putCall.input.Item.s3Key).toMatch(/^statements\/user-abc\/[0-9a-f-]{36}\.pdf$/);
    expect(putCall.input.Item.status).toBe('pending');
  });
});
