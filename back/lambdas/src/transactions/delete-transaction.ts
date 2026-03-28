import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { extractUserId, errorResponse, successResponse, decodeSk } from "./utils";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

const deleteGroup = async (pk: string, sk: string): Promise<APIGatewayProxyResult> => {
  const getResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk, sk },
  }));

  if (!getResult.Item) {
    return errorResponse(404, "Transaction not found");
  }

  const { groupId } = getResult.Item;

  const queryResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
    FilterExpression: "groupId = :groupId",
    ExpressionAttributeValues: {
      ":pk": pk,
      ":skPrefix": "TRANS#",
      ":groupId": groupId,
    },
  }));

  const items = queryResult.Items ?? [];

  // BatchWriteCommand supports max 25 items per request
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map((item) => ({
          DeleteRequest: {
            Key: { pk: item.pk, sk: item.sk },
          },
        })),
      },
    }));
  }

  return successResponse(200, { message: `Deleted ${items.length} transactions` });
};

const deleteSingle = async (pk: string, sk: string): Promise<APIGatewayProxyResult> => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
      ConditionExpression: "attribute_exists(pk)",
    }));

    return successResponse(200, { message: "Transaction deleted" });
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Transaction not found");
    }
    throw error;
  }
};

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
    const pk = `USER#${userId}`;
    const isGroupDelete = event.queryStringParameters?.deleteGroup === "true";

    if (isGroupDelete) {
      return await deleteGroup(pk, decodedSk);
    }

    return await deleteSingle(pk, decodedSk);
  } catch (error) {
    console.error(error);
    return errorResponse(500, "Internal server error");
  }
};
