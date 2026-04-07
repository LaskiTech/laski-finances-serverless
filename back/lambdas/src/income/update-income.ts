import { GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { UpdateIncomeSchema } from "./schemas";
import { docClient, withAuth, errorResponse, successResponse, parseJsonBody, decodeSk } from "../shared/utils";
import { updateMonthlySummary } from "../shared/update-monthly-summary";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
  const sk = event.pathParameters?.sk;
  if (!sk) {
    return errorResponse(400, "Missing income key");
  }

  const decodedSk = decodeSk(sk);
  const pk = `USER#${userId}`;

  const rawBody = parseJsonBody(event.body);
  if (rawBody === null) {
    return errorResponse(400, "Invalid request body");
  }

  const parsed = UpdateIncomeSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, "Validation failed", errors);
  }

  const { description, amount, date, source, category } = parsed.data;
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedSource = source.trim().toLowerCase();

  // Read existing item
  const existing = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk, sk: decodedSk },
  }));

  if (!existing.Item || existing.Item.type !== 'INC') {
    return errorResponse(404, "Income entry not found");
  }

  const updateGroup = event.queryStringParameters?.updateGroup === "true";

  if (updateGroup && existing.Item.isRecurring && existing.Item.recurringId) {
    // Group update: update all future entries in this recurring group
    return updateRecurringGroup(pk, existing.Item, { description, amount, date, source: normalizedSource, category: normalizedCategory }, logger);
  }

  // Single update
  const yearMonth = new Date(date).toISOString().slice(0, 7);
  const categoryMonth = `${normalizedCategory}#${yearMonth}`;

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: decodedSk },
      ConditionExpression: "attribute_exists(pk)",
      UpdateExpression: "SET description = :description, amount = :amount, #date = :date, #source = :source, category = :category, categoryMonth = :categoryMonth",
      ExpressionAttributeNames: {
        "#date": "date",
        "#source": "source",
      },
      ExpressionAttributeValues: {
        ":description": description,
        ":amount": amount,
        ":date": date,
        ":source": normalizedSource,
        ":category": normalizedCategory,
        ":categoryMonth": categoryMonth,
      },
      ReturnValues: "ALL_NEW",
    }));

    const oldItem = existing.Item;
    await updateMonthlySummary(docClient, pk, oldItem.date, oldItem.amount, 'INC', 'subtract');
    await updateMonthlySummary(docClient, pk, date, amount, 'INC', 'add');

    return successResponse(200, result.Attributes as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Income entry not found");
    }
    logger.error("Update failed", error);
    throw error;
  }
});

async function updateRecurringGroup(
  pk: string,
  targetItem: Record<string, unknown>,
  payload: { description: string; amount: number; date: string; source: string; category: string },
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

  const items = (queryResult.Items ?? []).filter(
    (item) => (item.date as string) >= targetDate,
  );

  let updatedCount = 0;
  for (const item of items) {
    const yearMonth = new Date(item.date as string).toISOString().slice(0, 7);
    const categoryMonth = `${payload.category}#${yearMonth}`;

    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: item.pk, sk: item.sk },
      UpdateExpression: "SET description = :description, amount = :amount, #source = :source, category = :category, categoryMonth = :categoryMonth",
      ExpressionAttributeNames: { "#source": "source" },
      ExpressionAttributeValues: {
        ":description": payload.description,
        ":amount": payload.amount,
        ":source": payload.source,
        ":category": payload.category,
        ":categoryMonth": categoryMonth,
      },
    }));

    // Subtract old, add new
    await updateMonthlySummary(docClient, pk, item.date as string, item.amount as number, 'INC', 'subtract');
    await updateMonthlySummary(docClient, pk, item.date as string, payload.amount, 'INC', 'add');
    updatedCount++;
  }

  logger.info("Recurring income group updated", { recurringId, updatedCount });
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify({ message: `Updated ${updatedCount} income entries`, updatedCount }),
  };
}
