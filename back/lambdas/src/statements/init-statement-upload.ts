import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  docClient,
  withAuth,
  errorResponse,
  successResponse,
  parseJsonBody,
} from '../shared/utils';

const STATEMENTS_TABLE_NAME = process.env.STATEMENTS_TABLE_NAME!;
const STATEMENTS_BUCKET_NAME = process.env.STATEMENTS_BUCKET_NAME!;

const s3Client = new S3Client({});

const InitUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(['application/pdf', 'text/csv']),
  documentType: z.enum(['BANK_ACCOUNT', 'CREDIT_CARD']),
  bank: z.enum(['ITAU']),
});

const EXPIRES_IN_SECONDS = 600;
const MAX_BYTES = 10 * 1024 * 1024;

export const handler = withAuth(async (event, userId, logger) => {
  const rawBody = parseJsonBody(event.body);
  if (rawBody === null) {
    return errorResponse(400, 'Invalid request body');
  }

  const parsed = InitUploadSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, 'Validation failed', errors);
  }

  const { filename, contentType, documentType, bank } = parsed.data;
  const statementId = uuidv4();
  const ext = contentType === 'application/pdf' ? 'pdf' : 'csv';
  const s3Key = `statements/${userId}/${statementId}.${ext}`;
  const now = new Date().toISOString();
  const pk = `USER#${userId}`;

  await docClient.send(new PutCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Item: {
      pk,
      sk: `STATEMENT#${statementId}`,
      statementId,
      bank,
      documentType,
      filename,
      contentType,
      s3Key,
      status: 'pending',
      errors: [],
      createdAt: now,
      updatedAt: now,
    },
  }));

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: STATEMENTS_BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    }),
    { expiresIn: EXPIRES_IN_SECONDS },
  );

  const expiresAt = new Date(Date.now() + EXPIRES_IN_SECONDS * 1000).toISOString();

  logger.info('Statement upload initiated', { statementId, documentType, bank });
  return successResponse(202, {
    statementId,
    uploadUrl,
    expiresAt,
    maxBytes: MAX_BYTES,
  });
});
