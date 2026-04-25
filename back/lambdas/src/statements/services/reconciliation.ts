import { createHash } from 'node:crypto';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../../shared/utils';
import type { ExtractedTransaction } from '../parsers/types';

export interface ReconciliationCandidate {
  candidateId: string;
  confidence: 'high' | 'ambiguous' | 'none';
  parentStatementId?: string;
  parentSk?: string;
  parentDescription?: string;
  candidateParents?: Array<{ sk: string; description: string; date: string }>;
  childStatementId: string;
  childCount: number;
  totalAmount: number;
  dateWindow: { from: string; to: string };
}

export interface StatementLike {
  statementId: string;
  documentType: 'BANK_ACCOUNT' | 'CREDIT_CARD';
  pk: string;
}

export interface CreditCardParseResult {
  extractedTransactions: ExtractedTransaction[];
  totalAmount?: number;
  dueDate?: string;
}

export interface BankAccountParseResult {
  extractedTransactions: ExtractedTransaction[];
}

export const BILL_PAYMENT_RE =
  /(^|\s)(ITAU\s+BLACK|PAG\s+FATURA|FATURA\s+CARTAO|PAGAMENTO\s+CARTAO)/i;

function shiftDate(iso: string, days: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function monthsBetween(fromIso: string, toIso: string): string[] {
  const [fy, fm] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  const months: string[] = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

function candidateId(parentSk: string | undefined, childStatementId: string): string {
  return createHash('sha256')
    .update(`${parentSk ?? 'none'}|${childStatementId}`)
    .digest('hex')
    .slice(0, 16);
}

async function findBillPaymentInLedger(
  pk: string,
  total: number,
  dueDate: string,
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<Array<{ sk: string; description: string; date: string }>> {
  const from = shiftDate(dueDate, -3);
  const to = shiftDate(dueDate, 3);
  const months = monthsBetween(from, to);
  const matches: Array<{ sk: string; description: string; date: string }> = [];

  for (const month of months) {
    const res = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :prefix)',
      ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      ExpressionAttributeValues: { ':pk': pk, ':prefix': `TRANS#${month}#EXP#` },
    }));
    for (const item of res.Items ?? []) {
      const desc = String(item.description ?? '');
      const date = String(item.date ?? '');
      const amount = Number(item.amount ?? 0);
      if (date < from || date > to) continue;
      if (Math.abs(amount - total) > 0.005) continue;
      if (!BILL_PAYMENT_RE.test(desc)) continue;
      matches.push({ sk: String(item.sk), description: desc, date });
    }
  }
  return matches;
}

async function findCreditCardStatement(
  pk: string,
  amount: number,
  rowDate: string,
  statementsTableName: string,
  client: DynamoDBDocumentClient,
): Promise<Array<{ statementId: string; sk: string; totalAmount: number; dueDate: string }>> {
  const from = shiftDate(rowDate, -3);
  const to = shiftDate(rowDate, 3);
  const res = await client.send(new QueryCommand({
    TableName: statementsTableName,
    IndexName: 'GSI_StatementsByDocumentTypeDueDate',
    KeyConditionExpression:
      '#pk = :pk AND documentTypeDueDate BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: {
      ':pk': pk,
      ':from': `CREDIT_CARD#${from}`,
      ':to': `CREDIT_CARD#${to}`,
    },
  }));
  const out: Array<{ statementId: string; sk: string; totalAmount: number; dueDate: string }> = [];
  for (const item of res.Items ?? []) {
    const total = Number(item.totalAmount ?? 0);
    if (Math.abs(total - amount) > 0.005) continue;
    out.push({
      statementId: String(item.statementId),
      sk: String(item.sk),
      totalAmount: total,
      dueDate: String(item.dueDate),
    });
  }
  return out;
}

export interface ReconcileDeps {
  client?: DynamoDBDocumentClient;
  ledgerTableName?: string;
  statementsTableName?: string;
}

export async function reconcile(
  stmt: StatementLike,
  parsed: CreditCardParseResult | BankAccountParseResult,
  deps: ReconcileDeps = {},
): Promise<ReconciliationCandidate[]> {
  const client = deps.client ?? docClient;
  const ledgerTable = deps.ledgerTableName ?? process.env.TABLE_NAME!;
  const statementsTable = deps.statementsTableName ?? process.env.STATEMENTS_TABLE_NAME!;

  if (stmt.documentType === 'CREDIT_CARD') {
    const cc = parsed as CreditCardParseResult;
    if (cc.totalAmount === undefined || !cc.dueDate) return [];

    const matches = await findBillPaymentInLedger(
      stmt.pk,
      cc.totalAmount,
      cc.dueDate,
      client,
      ledgerTable,
    );
    const from = shiftDate(cc.dueDate, -3);
    const to = shiftDate(cc.dueDate, 3);

    if (matches.length === 1) {
      const m = matches[0];
      return [{
        candidateId: candidateId(m.sk, stmt.statementId),
        confidence: 'high',
        parentSk: m.sk,
        parentDescription: m.description,
        childStatementId: stmt.statementId,
        childCount: cc.extractedTransactions.length,
        totalAmount: cc.totalAmount,
        dateWindow: { from, to },
      }];
    }
    if (matches.length > 1) {
      return [{
        candidateId: candidateId(undefined, stmt.statementId),
        confidence: 'ambiguous',
        candidateParents: matches,
        childStatementId: stmt.statementId,
        childCount: cc.extractedTransactions.length,
        totalAmount: cc.totalAmount,
        dateWindow: { from, to },
      }];
    }
    return [{
      candidateId: candidateId(undefined, stmt.statementId),
      confidence: 'none',
      childStatementId: stmt.statementId,
      childCount: cc.extractedTransactions.length,
      totalAmount: cc.totalAmount,
      dateWindow: { from, to },
    }];
  }

  // BANK_ACCOUNT flow
  const ba = parsed as BankAccountParseResult;
  const out: ReconciliationCandidate[] = [];
  const billPayRows = ba.extractedTransactions.filter(
    (r) => r.type === 'EXP' && BILL_PAYMENT_RE.test(r.description),
  );

  for (const row of billPayRows) {
    const matches = await findCreditCardStatement(
      stmt.pk,
      row.amount,
      row.date,
      statementsTable,
      client,
    );
    const from = shiftDate(row.date, -3);
    const to = shiftDate(row.date, 3);

    if (matches.length === 1) {
      out.push({
        candidateId: candidateId(undefined, matches[0].statementId),
        confidence: 'high',
        parentStatementId: stmt.statementId,
        parentDescription: row.description,
        childStatementId: matches[0].statementId,
        childCount: 0,
        totalAmount: row.amount,
        dateWindow: { from, to },
      });
    } else if (matches.length > 1) {
      out.push({
        candidateId: candidateId(undefined, stmt.statementId),
        confidence: 'ambiguous',
        parentStatementId: stmt.statementId,
        parentDescription: row.description,
        candidateParents: matches.map((m) => ({
          sk: m.sk,
          description: `CREDIT_CARD ${m.dueDate}`,
          date: m.dueDate,
        })),
        childStatementId: matches[0]?.statementId ?? '',
        childCount: 0,
        totalAmount: row.amount,
        dateWindow: { from, to },
      });
    } else {
      out.push({
        candidateId: candidateId(undefined, stmt.statementId),
        confidence: 'none',
        parentStatementId: stmt.statementId,
        parentDescription: row.description,
        childStatementId: '',
        childCount: 0,
        totalAmount: row.amount,
        dateWindow: { from, to },
      });
    }
  }

  return out;
}
