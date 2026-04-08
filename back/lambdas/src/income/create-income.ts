import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { CreateIncomeSchema } from "./schemas";
import { docClient, withAuth, errorResponse, successResponse, parseJsonBody } from "../shared/utils";
import { updateMonthlySummary } from "../shared/update-monthly-summary";

const TABLE_NAME = process.env.TABLE_NAME!;
const MAX_ENTRIES = 500;

export const handler = withAuth(async (event, userId, logger) => {
  const rawBody = parseJsonBody(event.body);
  if (rawBody === null) {
    return errorResponse(400, "Invalid request body");
  }

  const parsed = CreateIncomeSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, "Validation failed", errors);
  }

  const { description, totalAmount, date, source, category, recurrence } = parsed.data;
  const normalizedCategory = category.trim().toLowerCase();
  const normalizedSource = source.trim().toLowerCase();
  const pk = `USER#${userId}`;
  const groupId = uuidv4();

  // Generate dates for the series
  const dates: Date[] = [];
  const baseDate = new Date(date);

  if (!recurrence) {
    dates.push(baseDate);
  } else {
    const { frequency, endDate, occurrences } = recurrence;

    if (occurrences !== undefined) {
      for (let i = 0; i < occurrences; i++) {
        const d = new Date(date);
        if (frequency === 'monthly') {
          d.setMonth(d.getMonth() + i);
        } else {
          d.setDate(d.getDate() + i * 7);
        }
        dates.push(d);
      }
    } else if (endDate !== undefined) {
      const end = new Date(endDate);
      let i = 0;
      while (true) {
        const d = new Date(date);
        if (frequency === 'monthly') {
          d.setMonth(d.getMonth() + i);
        } else {
          d.setDate(d.getDate() + i * 7);
        }
        if (d > end) break;
        dates.push(d);
        i++;
        if (dates.length >= MAX_ENTRIES) break;
      }
    }
  }

  if (dates.length > MAX_ENTRIES) {
    return errorResponse(400, `Recurrence generates more than ${MAX_ENTRIES} entries`);
  }

  const isRecurring = !!recurrence;
  const items = dates.map((d, i) => {
    const yearMonth = d.toISOString().slice(0, 7);
    return {
      pk,
      sk: `TRANS#${yearMonth}#INC#${uuidv4()}`,
      description: dates.length > 1 ? `${description} (${i + 1}/${dates.length})` : description,
      amount: totalAmount,
      totalAmount,
      category: normalizedCategory,
      source: normalizedSource,
      type: 'INC' as const,
      date: d.toISOString(),
      groupId,
      installmentNumber: i + 1,
      installmentTotal: dates.length,
      categoryMonth: `${normalizedCategory}#${yearMonth}`,
      ...(isRecurring && { isRecurring: true, recurringId: groupId }),
    };
  });

  // BatchWrite in 25-item chunks
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
    await updateMonthlySummary(docClient, pk, item.date, item.amount, 'INC', 'add');
  }

  logger.info("Income entries created", { count: items.length, groupId });
  return successResponse(201, {
    message: "Income entry/entries created successfully",
    recurringId: isRecurring ? groupId : undefined,
    entriesCreated: items.length,
  });
});
