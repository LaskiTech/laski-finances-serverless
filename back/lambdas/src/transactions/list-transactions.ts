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
  let filterExpression: string | undefined;
  const exprValues: Record<string, unknown> = { ":pk": `USER#${userId}` };
  const exprNames: Record<string, string> = {};

  if (month) {
    skPrefix += `${month}#`;
    if (type) {
      skPrefix += `${type}#`;
    }
  } else if (type) {
    // No month provided — apply type filter via FilterExpression (SK prefix alone can't filter by type without a month)
    filterExpression = "#type = :type";
    exprValues[":type"] = type;
    exprNames["#type"] = "type";
  }

  exprValues[":skPrefix"] = skPrefix;

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
      FilterExpression: filterExpression,
      ExpressionAttributeValues: exprValues,
      ...(Object.keys(exprNames).length > 0 && { ExpressionAttributeNames: exprNames }),
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
