import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  docClient,
  withAuth,
  errorResponse,
  successResponse,
  parseJsonBody,
} from '../shared/utils';
import { updateMonthlySummary } from '../shared/update-monthly-summary';
import { buildLinkSk, buildLinkId } from '../links/link-utils';
import { buildImportHash } from './services/import-hash';
import { batchQueryLedgerByImportHash } from './shared/statement-io';
import type { ExtractedTransaction } from './parsers/types';
import type { ReconciliationCandidate } from './services/reconciliation';

const STATEMENTS_TABLE_NAME = process.env.STATEMENTS_TABLE_NAME!;
const TABLE_NAME = process.env.TABLE_NAME!;
const LINKS_TABLE_NAME = process.env.LINKS_TABLE_NAME!;

const ConfirmSchema = z.object({
  selectedIndices: z.array(z.number().int().nonnegative()),
  acceptedReconciliationIds: z.array(z.string()).default([]),
  reconciliationChoices: z.record(z.string(), z.string()).optional(),
});

interface WrittenEntry {
  index: number;
  sk: string;
  tx: ExtractedTransaction;
  hash: string;
}

interface SkippedEntry {
  index: number;
  matchedSk: string;
}

function buildLedgerSk(date: string, type: 'INC' | 'EXP'): string {
  const yearMonth = date.slice(0, 7);
  return `TRANS#${yearMonth}#${type}#${uuidv4()}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function batchWriteWithRetry(
  tableName: string,
  items: Array<{ PutRequest: { Item: Record<string, unknown> } }>,
): Promise<void> {
  let unprocessed = items;
  for (let attempt = 0; attempt < 4 && unprocessed.length > 0; attempt++) {
    if (attempt > 0) {
      const backoff = 2 ** (attempt - 1) * 100;
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
    const res = await docClient.send(new BatchWriteCommand({
      RequestItems: { [tableName]: unprocessed },
    }));
    const remaining = res.UnprocessedItems?.[tableName] ?? [];
    unprocessed = remaining as typeof unprocessed;
  }
  if (unprocessed.length > 0) {
    throw new Error(`BatchWrite unprocessed after retries: ${unprocessed.length}`);
  }
}

export const handler = withAuth(async (event, userId, logger) => {
  const statementId = event.pathParameters?.statementId;
  if (!statementId) return errorResponse(400, 'statementId required');

  const rawBody = parseJsonBody(event.body);
  if (rawBody === null) return errorResponse(400, 'Invalid request body');

  const parsed = ConfirmSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(400, 'Validation failed', parsed.error.issues.map((i) => i.message));
  }
  const { selectedIndices, acceptedReconciliationIds, reconciliationChoices } = parsed.data;

  if (selectedIndices.length === 0) {
    return errorResponse(400, 'No transactions selected');
  }

  const pk = `USER#${userId}`;
  const sk = `STATEMENT#${statementId}`;

  const stmtRes = await docClient.send(new GetCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Key: { pk, sk },
  }));
  if (!stmtRes.Item) return errorResponse(404, 'Statement not found');

  const stmt = stmtRes.Item;
  const drafts = (stmt.extractedTransactions ?? []) as ExtractedTransaction[];
  const candidates = (stmt.reconciliationCandidates ?? []) as ReconciliationCandidate[];

  for (const idx of selectedIndices) {
    if (idx >= drafts.length) {
      return errorResponse(400, `selectedIndex ${idx} out of bounds`);
    }
  }

  const prepared = selectedIndices.map((index) => {
    const draft = drafts[index];
    const normalizedCategory = (draft.category ?? 'uncategorized').trim().toLowerCase();
    const normalizedSource = draft.source.trim().toLowerCase();
    const normalized: ExtractedTransaction = {
      ...draft,
      category: normalizedCategory,
      source: normalizedSource,
    };
    return { index, tx: normalized, hash: buildImportHash(userId, normalized) };
  });

  const existing = await batchQueryLedgerByImportHash(pk, prepared.map((c) => c.hash));
  const skipped: SkippedEntry[] = [];
  const toWrite: Array<{ index: number; tx: ExtractedTransaction; hash: string }> = [];
  for (const c of prepared) {
    const match = existing.get(c.hash);
    if (match) {
      skipped.push({ index: c.index, matchedSk: match.sk });
    } else {
      toWrite.push(c);
    }
  }

  const written: WrittenEntry[] = [];
  const now = new Date().toISOString();

  for (const batch of chunk(toWrite, 25)) {
    const batchItems = batch.map((entry) => {
      const ledgerSk = buildLedgerSk(entry.tx.date, entry.tx.type);
      written.push({ index: entry.index, sk: ledgerSk, tx: entry.tx, hash: entry.hash });
      const yearMonth = entry.tx.date.slice(0, 7);
      const Item: Record<string, unknown> = {
        pk,
        sk: ledgerSk,
        description: entry.tx.description,
        amount: entry.tx.amount,
        totalAmount: entry.tx.amount,
        type: entry.tx.type,
        category: entry.tx.category,
        source: entry.tx.source,
        date: entry.tx.date,
        groupId: entry.tx.groupId ?? uuidv4(),
        installmentNumber: entry.tx.installmentNumber ?? 1,
        installmentTotal: entry.tx.installmentTotal ?? 1,
        categoryMonth: `${entry.tx.category}#${yearMonth}`,
        importHash: entry.hash,
        sourceStatementId: statementId,
        createdAt: now,
      };
      if (entry.tx.meta) Item.meta = entry.tx.meta;
      return { PutRequest: { Item } };
    });

    await batchWriteWithRetry(TABLE_NAME, batchItems);
  }

  for (const entry of written) {
    await updateMonthlySummary(
      docClient,
      pk,
      entry.tx.date,
      entry.tx.amount,
      entry.tx.type,
      'add',
    );
  }

  const linked: Array<{ candidateId: string; parentSk: string; childSk: string; linkId: string }> = [];
  const linkFailed: Array<{ candidateId: string; childSk?: string; reason: string }> = [];

  for (const candidateId of acceptedReconciliationIds) {
    const candidate = candidates.find((c) => c.candidateId === candidateId);
    if (!candidate) {
      linkFailed.push({ candidateId, reason: 'candidate not found' });
      continue;
    }
    let parentSk: string | undefined = candidate.parentSk;
    if (!parentSk) {
      const chosen = reconciliationChoices?.[candidateId];
      if (chosen) {
        parentSk = chosen;
      } else if (candidate.confidence === 'ambiguous') {
        linkFailed.push({ candidateId, reason: 'ambiguous candidate requires reconciliationChoices' });
        continue;
      }
    }

    if (!parentSk) {
      if (candidate.parentStatementId === statementId) {
        const billPayment = written.find((w) =>
          w.tx.type === 'EXP' &&
          Math.abs(w.tx.amount - candidate.totalAmount) < 0.005,
        );
        if (billPayment) parentSk = billPayment.sk;
      }
    }

    if (!parentSk) {
      linkFailed.push({ candidateId, reason: 'parent not resolvable' });
      continue;
    }

    const children = candidate.childStatementId === statementId
      ? written.map((w) => w.sk)
      : [];

    if (children.length === 0 && candidate.childStatementId !== statementId) {
      linkFailed.push({ candidateId, reason: 'child statement not in this import' });
      continue;
    }

    for (const childSk of children) {
      if (childSk === parentSk) continue;
      const linkSk = buildLinkSk(parentSk, childSk);
      const linkId = buildLinkId(linkSk);
      try {
        await docClient.send(new PutCommand({
          TableName: LINKS_TABLE_NAME,
          Item: {
            pk,
            sk: linkSk,
            linkId,
            parentSk,
            childSk,
            createdAt: new Date().toISOString(),
            origin: 'statement-reconciliation',
            originStatementId: statementId,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        }));
        linked.push({ candidateId, parentSk, childSk, linkId });
      } catch (err) {
        if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
          linked.push({ candidateId, parentSk, childSk, linkId });
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        linkFailed.push({ candidateId, childSk, reason: message });
      }
    }
  }

  await docClient.send(new UpdateCommand({
    TableName: STATEMENTS_TABLE_NAME,
    Key: { pk, sk },
    UpdateExpression:
      'SET #status = :imported, importedCount = :n, updatedAt = :now REMOVE extractedTransactions',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':imported': 'imported',
      ':n': written.length,
      ':now': new Date().toISOString(),
    },
  }));

  logger.info('Statement import confirmed', {
    statementId,
    imported: written.length,
    skipped: skipped.length,
    linked: linked.length,
    linkFailed: linkFailed.length,
  });

  return successResponse(200, {
    imported: written.length,
    skipped,
    linked: linked.length,
    linkedDetails: linked,
    linkFailed,
  });
});
