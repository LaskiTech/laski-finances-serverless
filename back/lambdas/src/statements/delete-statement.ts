import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  docClient,
  withAuth,
  errorResponse,
  successResponse,
} from '../shared/utils';

const STATEMENTS_TABLE_NAME = process.env.STATEMENTS_TABLE_NAME!;
const STATEMENTS_BUCKET_NAME = process.env.STATEMENTS_BUCKET_NAME!;

const s3Client = new S3Client({});

export const handler = withAuth(async (event, userId, logger) => {
  const statementId = event.pathParameters?.statementId;
  if (!statementId) {
    return errorResponse(400, 'statementId required');
  }

  const pk = `USER#${userId}`;
  const sk = `STATEMENT#${statementId}`;

  const res = await docClient.send(new GetCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Key: { pk, sk },
  }));

  if (!res.Item) {
    return errorResponse(404, 'Statement not found');
  }

  if (res.Item.status === 'processing') {
    return errorResponse(409, 'Cannot delete a statement that is currently being processed');
  }

  const s3Key = res.Item.s3Key as string | undefined;
  if (s3Key) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: STATEMENTS_BUCKET_NAME,
        Key: s3Key,
      }));
    } catch (err) {
      logger.error('S3 delete failed', err, { s3Key });
    }
  }

  await docClient.send(new DeleteCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Key: { pk, sk },
  }));

  logger.info('Statement deleted', { statementId });
  return successResponse(200, { statementId, deleted: true });
});
