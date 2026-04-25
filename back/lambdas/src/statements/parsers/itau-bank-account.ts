import { extractText } from './pdf-text';
import type { ExtractedTransaction, ParseResult, Parser } from './types';

const BALANCE_DESCRIPTIONS = [
  'SALDO ANTERIOR',
  'SALDO TOTAL DISPONÍVEL DIA',
  'SALDO TOTAL DISPONÃVEL DIA',
  'SALDO DO DIA',
  'SALDO FINAL DO PERÍODO',
  'SALDO FINAL DO PERIODO',
];

const HEADER_AGENCIA_RE = /ag[êe]ncia:\s*(\d{4})\s*conta:\s*(\d{3,5}-\d)/i;
const ROW_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}))?$/;

function parseBrl(value: string): number {
  return Number(value.replace(/\./g, '').replace(',', '.'));
}

function toIso(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}

function normalizeDesc(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function isBalanceLine(description: string): boolean {
  return BALANCE_DESCRIPTIONS.some((bd) => description.toUpperCase().startsWith(bd));
}

/**
 * Pure-text parser. Input is the flat text produced by `pdf-text.extractText`
 * or a synthetic test fixture — one line per transaction row.
 */
export function parseBankAccountText(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Derive source from the header line.
  let agencia = '';
  let conta = '';
  for (const line of lines) {
    const match = HEADER_AGENCIA_RE.exec(line);
    if (match) {
      agencia = match[1];
      conta = match[2];
      break;
    }
  }
  const source = (agencia && conta
    ? `itau-corrente-${agencia}-${conta}`
    : 'itau-corrente'
  ).toLowerCase();

  const extractedTransactions: ExtractedTransaction[] = [];

  // Truncate at disclaimer sections.
  const cutoffIdx = lines.findIndex(
    (l) => l.startsWith('Aviso!') || l.startsWith('Os saldos acima'),
  );
  const effective = cutoffIdx >= 0 ? lines.slice(0, cutoffIdx) : lines;

  for (const line of effective) {
    const row = ROW_RE.exec(line);
    if (!row) continue;

    const [, dateStr, rawDescRaw, valueStr, balanceStr] = row;
    const rawDesc = normalizeDesc(rawDescRaw);

    if (isBalanceLine(rawDesc)) continue;

    // Lines that only carry a balance (no real value) show up with the
    // number in the "balance" column. The regex above requires a value
    // group, but for defensive coding filter rows where `valueStr` is
    // present but description is a balance label — already handled above.
    // Additionally skip rows that have only a balance column and no value.
    if (!valueStr) continue;
    // balanceStr is ignored — balance numbers are never emitted.
    void balanceStr;

    const rawValue = parseBrl(valueStr);
    const type = rawValue < 0 ? 'EXP' : 'INC';
    const amount = Math.abs(rawValue);
    const dateIso = toIso(dateStr);

    extractedTransactions.push({
      date: dateIso,
      description: rawDesc,
      amount,
      type,
      source,
      category: 'uncategorized',
    });
  }

  extractedTransactions.sort((a, b) =>
    a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
  );

  return {
    extractedTransactions,
    bankAccount: source,
  };
}

export const itauBankAccountParser: Parser = {
  async parse(bytes) {
    const text = await extractText(bytes);
    return parseBankAccountText(text);
  },
  parseText(text) {
    return parseBankAccountText(text);
  },
};
