import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { extractUserId, errorResponse, successResponse, decodeSk } from "./utils";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = extractUserId(event);

    if (!userId) {
      return errorResponse(401, "Unauthorized");
    }

    const sk = event.pathParameters?.sk;

    if (!sk) {
      return errorResponse(400, "Missing transaction key");
    }

    const decodedSk = decodeSk(sk);

    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: decodedSk,
      },
    }));

    if (!result.Item) {
      return errorResponse(404, "Transaction not found");
    }

    return successResponse(200, result.Item as Record<string, unknown>);
  } catch (error) {
    console.error(error);
    return errorResponse(500, "Internal server error");
  }
};
