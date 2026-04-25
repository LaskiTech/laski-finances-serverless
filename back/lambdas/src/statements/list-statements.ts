import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  docClient,
  withAuth,
  errorResponse,
  successResponse,
} from '../shared/utils';

const STATEMENTS_TABLE_NAME = process.env.STATEMENTS_TABLE_NAME!;

const PAGE_SIZE = 50;

export const handler = withAuth(async (event, userId, _logger) => {
  const pk = `USER#${userId}`;
  const limit = Math.min(
    Number(event.queryStringParameters?.limit ?? PAGE_SIZE) || PAGE_SIZE,
    200,
  );
  const cursor = event.queryStringParameters?.cursor;

  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (cursor) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      return errorResponse(400, 'Invalid cursor');
    }
  }

  const res = await docClient.send(new QueryCommand({
    TableName: STATEMENTS_TABLE_NAME,
    KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': pk, ':prefix': 'STATEMENT#' },
    Limit: limit,
    ExclusiveStartKey: exclusiveStartKey,
    ScanIndexForward: false,
  }));

  const items = (res.Items ?? []).map((item) => {
    const { extractedTransactions: _omit, ...rest } = item;
    return rest;
  });

  items.sort((a, b) => {
    const ad = String(a.createdAt ?? '');
    const bd = String(b.createdAt ?? '');
    if (ad === bd) return 0;
    return ad < bd ? 1 : -1;
  });

  const nextCursor = res.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64url')
    : null;

  return successResponse(200, { items, nextCursor });
});
