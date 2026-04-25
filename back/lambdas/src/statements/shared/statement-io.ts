import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../shared/utils';

export interface LedgerKeyMatch {
  sk: string;
}

/**
 * Batch-query `GSI_LedgerByImportHash` to detect Ledger items already
 * imported from the same extracted row. Returns a Map keyed by hash.
 *
 * DynamoDB has no native batch Query by SK — we issue one Query per hash.
 * In practice a single confirm never dedups more than a few dozen rows,
 * so sequential queries are acceptable.
 */
export async function batchQueryLedgerByImportHash(
  pk: string,
  hashes: string[],
  client: DynamoDBDocumentClient = docClient,
  tableName: string = process.env.TABLE_NAME!,
): Promise<Map<string, LedgerKeyMatch>> {
  const result = new Map<string, LedgerKeyMatch>();
  const unique = [...new Set(hashes)];

  for (const hash of unique) {
    const res = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI_LedgerByImportHash',
      KeyConditionExpression: '#pk = :pk AND importHash = :h',
      ExpressionAttributeNames: { '#pk': 'pk' },
      ExpressionAttributeValues: { ':pk': pk, ':h': hash },
      Limit: 1,
    }));
    const item = res.Items?.[0];
    if (item && typeof item.sk === 'string') {
      result.set(hash, { sk: item.sk });
    }
  }

  return result;
}
