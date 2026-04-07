import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ListIncomeQuerySchema } from "./schemas";
import { docClient, withAuth, errorResponse, successResponse } from "../shared/utils";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId) => {
  const queryParams = event.queryStringParameters ?? {};
  const parsed = ListIncomeQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, "Validation failed", errors);
  }

  const { month, recurring } = parsed.data;
  const pk = `USER#${userId}`;

  let keyCondition: string;
  const exprValues: Record<string, unknown> = { ':pk': pk };
  const filterParts: string[] = [];

  if (month) {
    // With month filter, target INC entries directly via SK prefix
    keyCondition = 'pk = :pk AND begins_with(sk, :skPrefix)';
    exprValues[':skPrefix'] = `TRANS#${month}#INC#`;
  } else {
    // Without month, query all TRANS# and filter by type
    keyCondition = 'pk = :pk AND begins_with(sk, :skPrefix)';
    exprValues[':skPrefix'] = 'TRANS#';
    filterParts.push('#type = :inc');
    exprValues[':inc'] = 'INC';
  }

  if (recurring === 'true') {
    filterParts.push('isRecurring = :isRecurring');
    exprValues[':isRecurring'] = true;
  }

  const filterExpression = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;
  const exprNames: Record<string, string> = {};
  if (filterExpression?.includes('#type')) {
    exprNames['#type'] = 'type';
  }

  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: keyCondition,
    FilterExpression: filterExpression,
    ExpressionAttributeValues: exprValues,
    ...(Object.keys(exprNames).length > 0 && { ExpressionAttributeNames: exprNames }),
    ScanIndexForward: false,
  }));

  return successResponse(200, { income: result.Items ?? [] });
});
