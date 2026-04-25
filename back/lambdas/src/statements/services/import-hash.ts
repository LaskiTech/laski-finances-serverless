import { createHash } from 'node:crypto';

export interface ImportHashInput {
  source: string;
  date: string;
  amount: number;
  description: string;
}

/**
 * Deterministic hash for idempotent statement imports. The same (user, row)
 * input always produces the same hash, which is stored on the Ledger item
 * as `importHash` and indexed by `GSI_LedgerByImportHash` for duplicate
 * detection before re-import.
 */
export function buildImportHash(userId: string, row: ImportHashInput): string {
  const normalizedSource = row.source.trim().toLowerCase();
  const normalizedDesc = row.description.trim();
  const amountStr = row.amount.toFixed(2);
  const input = `${userId}|${normalizedSource}|${row.date}|${amountStr}|${normalizedDesc}`;
  return createHash('sha256').update(input).digest('hex');
}
