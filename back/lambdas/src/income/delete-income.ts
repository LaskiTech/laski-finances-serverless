import {
  GetCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, withAuth, errorResponse, successResponse, decodeSk } from "../shared/utils";
import { updateMonthlySummary } from "../shared/update-monthly-summary";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
  const sk = event.pathParameters?.sk;
  if (!sk) {
    return errorResponse(400, "Missing income key");
  }

  const decodedSk = decodeSk(sk);
  const pk = `USER#${userId}`;

  // Read existing item
  const getResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk, sk: decodedSk },
  }));

  if (!getResult.Item || getResult.Item.type !== 'INC') {
    return errorResponse(404, "Income entry not found");
  }

  const item = getResult.Item;
  const deleteGroup = event.queryStringParameters?.deleteGroup === "true";

  if (deleteGroup && item.isRecurring && item.recurringId) {
    return deleteRecurringGroup(pk, item, logger);
  }

  // Single delete
  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: decodedSk },
      ConditionExpression: "attribute_exists(pk)",
    }));

    await updateMonthlySummary(docClient, pk, item.date as string, item.amount as number, 'INC', 'subtract');

    return successResponse(200, { message: "Income entry deleted" });
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Income entry not found");
    }
    logger.error("Delete failed", error);
    throw error;
  }
});

async function deleteRecurringGroup(
  pk: string,
  targetItem: Record<string, unknown>,
  logger: { info: (msg: string, extra?: Record<string, unknown>) => void },
) {
  const recurringId = targetItem.recurringId as string;
  const targetDate = targetItem.date as string;

  // Query all INC entries for this user
  const queryResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
    FilterExpression: "recurringId = :recurringId AND #type = :inc",
    ExpressionAttributeNames: { "#type": "type" },
    ExpressionAttributeValues: {
      ":pk": pk,
      ":skPrefix": "TRANS#",
      ":recurringId": recurringId,
      ":inc": "INC",
    },
  }));

  // Filter to future entries (from target date onward)
  const items = (queryResult.Items ?? []).filter(
    (item) => (item.date as string) >= targetDate,
  );

  // BatchWrite delete in 25-item chunks
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map((item) => ({
          DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
        })),
      },
    }));
  }

  // Subtract from MonthlySummary for each deleted item
  for (const item of items) {
    await updateMonthlySummary(docClient, pk, item.date as string, item.amount as number, 'INC', 'subtract');
  }

  logger.info("Recurring income group deleted", { recurringId, deletedCount: items.length });
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify({ message: `Deleted ${items.length} income entries`, deletedCount: items.length }),
  };
}
