import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, withAuth, errorResponse, successResponse, decodeSk } from "./utils";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId) => {
  const sk = event.pathParameters?.sk;

  if (!sk) {
    return errorResponse(400, "Missing transaction key");
  }

  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: `USER#${userId}`,
      sk: decodeSk(sk),
    },
  }));

  if (!result.Item) {
    return errorResponse(404, "Transaction not found");
  }

  return successResponse(200, result.Item as Record<string, unknown>);
});
