import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export type SummaryOperation = 'add' | 'subtract';

/**
 * Atomically updates the MonthlySummary table for a given user and month.
 *
 * Uses DynamoDB `ADD` expressions so concurrent writes are safe.
 * ADD on a non-existent attribute treats the prior value as 0, so this
 * safely creates the summary item on first write for a given month.
 *
 * Important: `balance` is NOT stored — always computed at read time as
 * `totalIncome - totalExpenses` per data-model.md.
 */
export async function updateMonthlySummary(
  client: DynamoDBDocumentClient,
  userId: string,
  date: string,
  amount: number,
  type: 'INC' | 'EXP',
  operation: SummaryOperation,
): Promise<void> {
  const tableName = process.env.SUMMARY_TABLE_NAME!;
  const yearMonth = date.slice(0, 7); // YYYY-MM from ISO date
  const delta = operation === 'add' ? amount : -amount;
  const countDelta = operation === 'add' ? 1 : -1;

  const field = type === 'INC' ? 'totalIncome' : 'totalExpenses';

  await client.send(new UpdateCommand({
    TableName: tableName,
    Key: {
      pk: userId,
      sk: `SUMMARY#${yearMonth}`,
    },
    UpdateExpression: 'ADD #field :delta, transactionCount :countDelta SET updatedAt = :now',
    ExpressionAttributeNames: {
      '#field': field,
    },
    ExpressionAttributeValues: {
      ':delta': delta,
      ':countDelta': countDelta,
      ':now': new Date().toISOString(),
    },
  }));
}
