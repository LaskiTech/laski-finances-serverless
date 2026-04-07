import {
  DeleteCommand,
  GetCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyResult } from "aws-lambda";
import { docClient, withAuth, errorResponse, successResponse, decodeSk } from "./utils";
import { updateMonthlySummary } from "../shared/update-monthly-summary";

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

  // Subtract from MonthlySummary for each deleted item
  for (const item of items) {
    await updateMonthlySummary(docClient, pk, item.date, item.amount, item.type, 'subtract');
  }

  return successResponse(200, { message: `Deleted ${items.length} transactions` });
};

const deleteSingle = async (pk: string, sk: string): Promise<APIGatewayProxyResult> => {
  // Read existing item for MonthlySummary subtraction
  const getResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk, sk },
  }));

  if (!getResult.Item) {
    return errorResponse(404, "Transaction not found");
  }

  const item = getResult.Item;

  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
      ConditionExpression: "attribute_exists(pk)",
    }));

    await updateMonthlySummary(docClient, pk, item.date, item.amount, item.type, 'subtract');

    return successResponse(200, { message: "Transaction deleted" });
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Transaction not found");
    }
    throw error;
  }
};

export const handler = withAuth(async (event, userId) => {
  const sk = event.pathParameters?.sk;

  if (!sk) {
    return errorResponse(400, "Missing transaction key");
  }

  const decodedSk = decodeSk(sk);
  const pk = `USER#${userId}`;
  const isGroupDelete = event.queryStringParameters?.deleteGroup === "true";

  if (isGroupDelete) {
    return deleteGroup(pk, decodedSk);
  }

  return deleteSingle(pk, decodedSk);
});
