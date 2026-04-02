import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ListQuerySchema } from "./schemas";
import { docClient, withAuth, errorResponse, successResponse } from "./utils";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
  const queryParams = event.queryStringParameters ?? {};
  const parsed = ListQuerySchema.safeParse(queryParams);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, "Validation failed", errors);
  }

  const { month, type, limit, lastKey } = parsed.data;

  let skPrefix = "TRANS#";
  if (month) {
    skPrefix += `${month}#`;
    if (type) {
      skPrefix += `${type}#`;
    }
  }

  // Decode Base64 JSON cursor from previous page response
  let exclusiveStartKey: Record<string, unknown> | undefined;
  if (lastKey) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(lastKey, 'base64').toString('utf-8'));
    } catch {
      return errorResponse(400, "Invalid pagination cursor");
    }
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${userId}`,
        ":skPrefix": skPrefix,
      },
      ScanIndexForward: false,
      Limit: limit ?? 50,
      ExclusiveStartKey: exclusiveStartKey,
    })
  );

  // Encode next page cursor — null when no more pages
  const nextKey = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : null;

  logger.info("Transactions listed", { count: result.Items?.length ?? 0, hasMore: nextKey !== null });
  return successResponse(200, { transactions: result.Items ?? [], nextKey });
});
