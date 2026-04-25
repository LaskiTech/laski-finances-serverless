import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  docClient,
  withAuth,
  errorResponse,
  successResponse,
} from '../shared/utils';
import { buildImportHash } from './services/import-hash';
import { batchQueryLedgerByImportHash } from './shared/statement-io';
import type { ExtractedTransaction } from './parsers/types';

const STATEMENTS_TABLE_NAME = process.env.STATEMENTS_TABLE_NAME!;

export const handler = withAuth(async (event, userId, _logger) => {
  const statementId = event.pathParameters?.statementId;
  if (!statementId) {
    return errorResponse(400, 'statementId required');
  }

  const pk = `USER#${userId}`;
  const res = await docClient.send(new GetCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Key: { pk, sk: `STATEMENT#${statementId}` },
  }));

  if (!res.Item) {
    return errorResponse(404, 'Statement not found');
  }

  const drafts = (res.Item.extractedTransactions ?? []) as ExtractedTransaction[];
  const hashes = drafts.map((d) => buildImportHash(userId, d));
  const existing = await batchQueryLedgerByImportHash(pk, hashes);

  const duplicates = drafts
    .map((_d, index) => {
      const h = hashes[index];
      const match = existing.get(h);
      return match ? { index, matchedLedgerSk: match.sk } : null;
    })
    .filter((x): x is { index: number; matchedLedgerSk: string } => x !== null);

  return successResponse(200, { ...res.Item, duplicates });
});
