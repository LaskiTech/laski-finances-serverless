import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { CreateTransactionSchema } from "./schemas";
import { docClient, withAuth, errorResponse, successResponse, parseJsonBody } from "./utils";
import { updateMonthlySummary } from "../shared/update-monthly-summary";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
  const rawBody = parseJsonBody(event.body);
  if (rawBody === null) {
    return errorResponse(400, "Invalid request body");
  }

  const parsed = CreateTransactionSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, "Validation failed", errors);
  }

  const { description, totalAmount, installments, date, category, source, type } = parsed.data;
  const transactionGroupId = uuidv4();
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedSource = source.trim().toLowerCase();
  const pk = `USER#${userId}`;

  // Build all items first (pure data, no I/O)
  const items = Array.from({ length: installments }, (_, i) => {
    const installmentDate = new Date(date);
    installmentDate.setMonth(installmentDate.getMonth() + i);
    const yearMonth = installmentDate.toISOString().slice(0, 7); // YYYY-MM format
    return {
      pk,
      sk: `TRANS#${yearMonth}#${type}#${uuidv4()}`,
      description: installments > 1 ? `${description} (${i + 1}/${installments})` : description,
      amount: totalAmount / installments,
      totalAmount,
      category: normalizedCategory,
      source: normalizedSource,
      type,
      date: installmentDate.toISOString(),
      groupId: transactionGroupId,
      installmentNumber: i + 1,
      installmentTotal: installments,
      categoryMonth: `${normalizedCategory}#${yearMonth}`,
    };
  });

  // BatchWriteCommand supports max 25 items per request — chunk if needed
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map((item) => ({ PutRequest: { Item: item } })),
      },
    }));
  }

  // Update MonthlySummary for each item
  for (const item of items) {
    await updateMonthlySummary(docClient, pk, item.date, item.amount, item.type, 'add');
  }

  logger.info("Transactions created", { count: items.length, groupId: transactionGroupId });
  return successResponse(201, { message: "Transaction(s) created successfully" });
});
