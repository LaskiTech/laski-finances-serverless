import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { UpdateTransactionSchema } from "./schemas";
import { docClient, withAuth, errorResponse, successResponse, parseJsonBody, decodeSk } from "./utils";
import { updateMonthlySummary } from "../shared/update-monthly-summary";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
  const sk = event.pathParameters?.sk;

  if (!sk) {
    return errorResponse(400, "Missing transaction key");
  }

  const decodedSk = decodeSk(sk);
  const pk = `USER#${userId}`;

  const rawBody = parseJsonBody(event.body);
  if (rawBody === null) {
    return errorResponse(400, "Invalid request body");
  }

  const parsed = UpdateTransactionSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, "Validation failed", errors);
  }

  const { description, amount, date, type, source, category } = parsed.data;
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedSource = source.trim().toLowerCase();
  const yearMonth = new Date(date).toISOString().slice(0, 7);
  const categoryMonth = `${normalizedCategory}#${yearMonth}`;

  // Read existing item for MonthlySummary subtraction
  const existing = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk, sk: decodedSk },
  }));

  if (!existing.Item) {
    return errorResponse(404, "Transaction not found");
  }

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: decodedSk },
      ConditionExpression: "attribute_exists(pk)",
      UpdateExpression: "SET description = :description, amount = :amount, #date = :date, #type = :type, #source = :source, category = :category, categoryMonth = :categoryMonth",
      ExpressionAttributeNames: {
        "#date": "date",
        "#type": "type",
        "#source": "source",
      },
      ExpressionAttributeValues: {
        ":description": description,
        ":amount": amount,
        ":date": date,
        ":type": type,
        ":source": normalizedSource,
        ":category": normalizedCategory,
        ":categoryMonth": categoryMonth,
      },
      ReturnValues: "ALL_NEW",
    }));

    // Subtract old summary, add new summary
    const oldItem = existing.Item;
    await updateMonthlySummary(docClient, pk, oldItem.date, oldItem.amount, oldItem.type, 'subtract');
    await updateMonthlySummary(docClient, pk, date, amount, type, 'add');

    return successResponse(200, result.Attributes as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Transaction not found");
    }
    logger.error("Update failed", error);
    throw error;
  }
});
