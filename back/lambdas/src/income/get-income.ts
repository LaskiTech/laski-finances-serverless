import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, withAuth, errorResponse, successResponse, decodeSk } from "../shared/utils";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId) => {
  const sk = event.pathParameters?.sk;
  if (!sk) {
    return errorResponse(400, "Missing income key");
  }

  const decodedSk = decodeSk(sk);
  const pk = `USER#${userId}`;

  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk, sk: decodedSk },
  }));

  if (!result.Item || result.Item.type !== 'INC') {
    return errorResponse(404, "Income entry not found");
  }

  return successResponse(200, result.Item as Record<string, unknown>);
});
