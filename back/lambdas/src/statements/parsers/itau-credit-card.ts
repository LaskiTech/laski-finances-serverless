import { v5 as uuidv5 } from 'uuid';
import { extractText } from './pdf-text';
import type {
  ExtractedInstallmentPreview,
  ExtractedTransaction,
  ParseResult,
  Parser,
} from './types';

const NAMESPACE_INSTALLMENT = 'a5b8f9c4-1b2e-4dab-9b6f-cd3b3f0c0001';

const POSTAGEM_RE = /Postagem:\s*(\d{2}\/\d{2}\/\d{4})/i;
const VENCIMENTO_RE = /Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/i;
// Matches both "Total desta fatura: R$ 9.181,49" (synthetic) and "= Total desta fatura 9.181,49" (real PDF)
const TOTAL_RE = /Total desta fatura\s*:?\s*(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2})/i;
const CARD_HEADER_RE = /\(\s*final\s+(\d{4})\s*\)/i;
const INSTALLMENT_SUFFIX_RE = /\s(\d{1,2})\/(\d{1,3})$/;
const TX_LINE_RE = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})$/;
const INTL_LINE_RE =
  /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;
const IOF_LINE_RE = /^Repasse de IOF.*?(-?\d{1,3}(?:\.\d{3})*,\d{2})$/i;

// Regex to detect a transaction-like token embedded in a merged line:
// DD/MM followed by description and a BRL amount
const TX_TOKEN_RE = /(\d{2}\/\d{2})\s+(.+?)\s+(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})/g;

const SECTION_EXCLUDED_PREFIXES = [
  'Total desta fatura',
  'Total da fatura anterior',
  'Pagamento efetuado em',
  'Saldo financiado',
  'Lançamentos no cartão',
  'Total transações inter',
  'Total lançamentos inter',
  'Total dos lançamentos',
  'Lançamentos: compras e saques',
  'Próxima fatura',
  'Demais faturas',
  'Total para próximas faturas',
  'DATA ESTABELECIMENTO',
  'Continua...',
];

type Section = 'IDLE' | 'TRANSACTIONS' | 'INTERNATIONAL' | 'FUTURE';

function parseBrl(value: string): number {
  return Number(value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
}

function stripCityAndNormalize(raw: string): string {
  // Remove trailing ".CITY" suffix (e.g. ALIMENTAÇÃO .FORTALEZA → ALIMENTAÇÃO)
  // Handle both "ALIMENTAÇÃO.FORTALEZA" and "ALIMENTAÇÃO .FORTALEZA"
  const noCity = raw.replace(/\s*\.([A-ZÀ-Ÿa-zà-ÿ ]+)$/, '');
  return noCity.trim().toLowerCase();
}

function inferYear(ddmm: string, postagem: { year: number; month: number }, future: boolean): number {
  const m = Number(ddmm.split('/')[1]);
  if (future) {
    return m >= postagem.month ? postagem.year : postagem.year + 1;
  }
  return m <= postagem.month ? postagem.year : postagem.year - 1;
}

function toIsoFromDDMM(ddmm: string, year: number): string {
  const [d, m] = ddmm.split('/');
  return `${year}-${m}-${d}`;
}

function isSkippable(line: string): boolean {
  return SECTION_EXCLUDED_PREFIXES.some((p) => line.startsWith(p));
}

function installmentGroupId(normalizedDescription: string, firstDate: string): string {
  return uuidv5(`${normalizedDescription}|${firstDate}`, NAMESPACE_INSTALLMENT);
}

/**
 * Split a merged two-column line into individual transaction lines.
 *
 * The real PDF text from extractText() merges left and right columns into
 * a single line, e.g.:
 *   "14/06 SAMSUNG NO ITAU 10/21 51,97 15/03 SALGADOS DO PONTO 50,00"
 *
 * This function splits such lines into individual transaction strings.
 */
function splitMergedTransactionLine(line: string): string[] {
  const matches: Array<{ index: number; full: string }> = [];
  TX_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TX_TOKEN_RE.exec(line)) !== null) {
    matches.push({ index: m.index, full: m[0] });
  }
  if (matches.length <= 1) return [line];
  return matches.map((match) => match.full);
}

/**
 * Split a merged two-column category line into individual category strings.
 *
 * E.g. "DIVERSOS .SAO PAULO ALIMENTAÇÃO .FORTALEZA" → ["DIVERSOS .SAO PAULO", "ALIMENTAÇÃO .FORTALEZA"]
 *
 * Heuristic: split on uppercase word boundaries that look like a new category.
 */
function splitMergedCategoryLine(line: string, expectedCount: number): string[] {
  if (expectedCount <= 1) return [line];

  // Common category keywords that signal a new category token
  const categoryKeywords = [
    'ALIMENTAÇÃO', 'VEÍCULOS', 'HOBBY', 'DIVERSOS', 'SAÚDE', 'VESTUÁRIO',
    'EDUCAÇÃO', 'TURISMO', 'SERVIÇOS', 'SAO PAULO', 'FORTALEZA', 'CURITIBA',
    'BLUMENAU', 'EXTREMA', 'CAUCAIA', 'BRASILIA', 'Barueri',
  ];

  // Try to split by finding category-like tokens
  // Pattern: look for known category words or UPPERCASE_WORD .CITY patterns
  const parts: string[] = [];
  const catRe = /([A-ZÀ-Ÿ][A-ZÀ-Ÿ ]+(?:\s*\.[A-ZÀ-Ÿa-zà-ÿ ]+)?)/g;
  let cm: RegExpExecArray | null;
  const catMatches: Array<{ index: number; text: string }> = [];
  while ((cm = catRe.exec(line)) !== null) {
    catMatches.push({ index: cm.index, text: cm[1] });
  }

  if (catMatches.length >= expectedCount) {
    // Distribute matches evenly
    const perPart = Math.ceil(catMatches.length / expectedCount);
    for (let i = 0; i < expectedCount; i++) {
      const start = i * perPart;
      const end = Math.min(start + perPart, catMatches.length);
      const slice = catMatches.slice(start, end).map((c) => c.text).join(' ');
      parts.push(slice);
    }
    return parts;
  }

  // Fallback: just return the whole line for each expected slot
  return Array(expectedCount).fill(line);
}

/**
 * Check if a line looks like a category/city line (not a transaction).
 * Category lines are text-only (no leading date pattern), not a section header,
 * and not a known non-category pattern.
 */
function isCategoryLine(line: string): boolean {
  // Must not start with a date pattern
  if (/^\d{2}\/\d{2}/.test(line)) return false;
  // Must not be a section header or skippable
  if (isSkippable(line)) return false;
  // Must not match known non-category patterns
  if (/^(Dólar|D[oó]lar|Total|Repasse|Continua|DATA|VALOR|US\$|R\$|PC\s*-|4004|0800|\d{5}\s+VK|=)/i.test(line)) return false;
  // Must not be a number-only line
  if (/^\d+$/.test(line.replace(/\s/g, ''))) return false;
  // Must not contain BRL amount patterns (likely a transaction or summary)
  if (/\d{1,3}(?:\.\d{3})*,\d{2}/.test(line)) return false;
  // If it's a short text line without numbers, it's likely a category
  return line.length > 0;
}

export function parseCreditCardText(text: string): ParseResult {
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Header extraction
  let postagem = { year: new Date().getUTCFullYear(), month: 1 };
  let dueDate: string | undefined;
  let totalAmount: number | undefined;

  for (const line of rawLines) {
    const p = POSTAGEM_RE.exec(line);
    if (p) {
      const [, dmy] = p;
      const [, month, year] = dmy.split('/').map(Number) as unknown as [number, number, number];
      postagem = { year, month };
    }
    const v = VENCIMENTO_RE.exec(line);
    if (v) {
      const [d, m, y] = v[1].split('/');
      dueDate = `${y}-${m}-${d}`;
    }
    const t = TOTAL_RE.exec(line);
    if (t && totalAmount === undefined) totalAmount = parseBrl(t[1]);
  }

  // Pre-process: expand merged two-column lines into individual lines.
  // The real PDF merges left/right columns on the same y-coordinate.
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    const expanded = splitMergedTransactionLine(rawLine);
    if (expanded.length > 1) {
      lines.push(...expanded);
    } else {
      lines.push(rawLine);
    }
  }

  const extracted: ExtractedTransaction[] = [];
  const future: ExtractedInstallmentPreview[] = [];
  const firstDateByCard: Record<string, string> = {};

  let section: Section = 'IDLE';
  let currentSource = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section transitions (prefix-based)
    if (/Compras parceladas\s*-?\s*pr[oó]ximas faturas/i.test(line)) {
      section = 'FUTURE';
      continue;
    }
    if (/Lan[çc]amentos internacionais/i.test(line)) {
      section = 'INTERNATIONAL';
      continue;
    }
    const cardMatch = CARD_HEADER_RE.exec(line);
    if (cardMatch) {
      currentSource = `itau-black-${cardMatch[1]}`;
      // Only switch to TRANSACTIONS if we're not already in INTERNATIONAL
      // (the card header inside international section sets the source but keeps the section)
      if (section !== 'INTERNATIONAL') {
        section = 'TRANSACTIONS';
      }
      continue;
    }

    if (section === 'IDLE') continue;

    if (isSkippable(line)) continue;

    // Skip non-content lines (page footers, headers, etc.)
    if (/^(PC\s*-|4004|0800|\d{5}\s+VK|Continua)/i.test(line)) continue;

    // IOF — synthetic fees row inside the international section
    if (section === 'INTERNATIONAL') {
      const iof = IOF_LINE_RE.exec(line);
      if (iof) {
        const amount = Math.abs(parseBrl(iof[1]));
        extracted.push({
          date: dueDate ?? `${postagem.year}-${String(postagem.month).padStart(2, '0')}-01`,
          description: 'IOF — Repasse internacional',
          amount,
          type: 'EXP',
          source: currentSource || 'itau-black',
          category: 'fees',
        });
        continue;
      }
    }

    // Future installments — each pair of lines (transaction, category).
    if (section === 'FUTURE') {
      const futRow = TX_LINE_RE.exec(line);
      if (!futRow) continue;
      const [, ddmm, descRaw, valueStr] = futRow;
      const installment = INSTALLMENT_SUFFIX_RE.exec(descRaw);
      if (!installment) continue;
      const description = descRaw.replace(INSTALLMENT_SUFFIX_RE, '').trim();
      const amount = Math.abs(parseBrl(valueStr));
      const year = inferYear(ddmm, postagem, true);
      const date = toIsoFromDDMM(ddmm, year);
      const next = lines[i + 1];
      const category = next && isCategoryLine(next) ? stripCityAndNormalize(next) : 'uncategorized';
      if (next && isCategoryLine(next)) i += 1;
      const installmentNumber = Number(installment[1]);
      const installmentTotal = Number(installment[2]);
      future.push({
        date,
        description,
        amount,
        source: currentSource || 'itau-black',
        category,
        installmentNumber,
        installmentTotal,
        groupId: installmentGroupId(description.toLowerCase(), firstDateByCard[currentSource] ?? date),
      });
      continue;
    }

    // Domestic transactions: DD/MM desc value then next line = category
    if (section === 'TRANSACTIONS') {
      const txMatch = TX_LINE_RE.exec(line);
      if (!txMatch) continue;
      const [, ddmm, descRaw, valueStr] = txMatch;
      const rawValue = parseBrl(valueStr);
      const type = rawValue < 0 ? 'INC' : 'EXP';
      const amount = Math.abs(rawValue);
      const year = inferYear(ddmm, postagem, false);
      const date = toIsoFromDDMM(ddmm, year);

      if (!firstDateByCard[currentSource]) firstDateByCard[currentSource] = date;

      const installment = INSTALLMENT_SUFFIX_RE.exec(descRaw);
      let description = descRaw;
      let installmentNumber: number | undefined;
      let installmentTotal: number | undefined;
      let groupId: string | undefined;
      if (installment) {
        description = descRaw.replace(INSTALLMENT_SUFFIX_RE, '').trim();
        installmentNumber = Number(installment[1]);
        installmentTotal = Number(installment[2]);
        groupId = installmentGroupId(
          description.toLowerCase(),
          firstDateByCard[currentSource] ?? date,
        );
      }

      // Look ahead for category line
      const nextLine = lines[i + 1];
      const category = nextLine && isCategoryLine(nextLine)
        ? stripCityAndNormalize(nextLine)
        : 'uncategorized';
      if (nextLine && isCategoryLine(nextLine)) i += 1;

      extracted.push({
        date,
        description,
        amount,
        type,
        source: currentSource || 'itau-black',
        category,
        ...(installmentNumber ? { installmentNumber, installmentTotal, groupId } : {}),
      });
      continue;
    }

    // International transactions: DD/MM desc BRL_amount (single amount on the line)
    // In the real PDF, international rows appear as:
    //   "28/03 CLAUDE.AI SUBSCRIPTION 116,96"
    // followed by a detail line like:
    //   "SAN FRANCISCO 110,00 BRL 20,96"
    // The BRL amount is on the transaction line itself.
    if (section === 'INTERNATIONAL') {
      // Try two-amount format first (synthetic test data)
      const intl = INTL_LINE_RE.exec(line);
      if (intl) {
        const [, ddmm, descRaw, usdStr, brlStr] = intl;
        const brl = Math.abs(parseBrl(brlStr));
        const usd = Math.abs(parseBrl(usdStr));
        const year = inferYear(ddmm, postagem, false);
        const date = toIsoFromDDMM(ddmm, year);
        const nextLine = lines[i + 1];
        const category = nextLine && isCategoryLine(nextLine)
          ? stripCityAndNormalize(nextLine)
          : 'uncategorized';
        if (nextLine && isCategoryLine(nextLine)) i += 1;
        extracted.push({
          date,
          description: descRaw,
          amount: brl,
          type: 'EXP',
          source: currentSource || 'itau-black',
          category,
          meta: { usd, brl },
        });
        continue;
      }

      // Single-amount format (real PDF): "28/03 CLAUDE.AI SUBSCRIPTION 116,96"
      // The next line has the USD detail: "SAN FRANCISCO 110,00 BRL 20,96"
      const txMatch = TX_LINE_RE.exec(line);
      if (txMatch) {
        const [, ddmm, descRaw, brlStr] = txMatch;
        const brl = Math.abs(parseBrl(brlStr));
        const year = inferYear(ddmm, postagem, false);
        const date = toIsoFromDDMM(ddmm, year);

        // Try to extract USD from the next line
        let usd: number | undefined;
        const nextLine = lines[i + 1];
        if (nextLine) {
          // Pattern: "SAN FRANCISCO 110,00 BRL 20,96" or "CITY USD_AMOUNT BRL USD_RATE"
          const usdMatch = /(\d{1,3}(?:\.\d{3})*,\d{2})\s+BRL\s+(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(nextLine);
          if (usdMatch) {
            usd = Math.abs(parseBrl(usdMatch[1]));
            i += 1; // skip the detail line
          }
        }

        // Skip the "Dólar de Conversão" line if present
        if (i + 1 < lines.length && /^D[oó]lar de Convers/i.test(lines[i + 1])) {
          i += 1;
        }

        // Look for category on the next available line
        const catLine = lines[i + 1];
        const category = catLine && isCategoryLine(catLine)
          ? stripCityAndNormalize(catLine)
          : 'uncategorized';
        if (catLine && isCategoryLine(catLine)) i += 1;

        extracted.push({
          date,
          description: descRaw,
          amount: brl,
          type: 'EXP',
          source: currentSource || 'itau-black',
          category,
          meta: { usd: usd ?? brl, brl },
        });
        continue;
      }
    }
  }

  // Conservation check — parser throws if mismatched against header total.
  if (totalAmount !== undefined) {
    const sum = extracted.reduce((acc, t) => acc + (t.type === 'EXP' ? t.amount : -t.amount), 0);
    if (Math.abs(sum - totalAmount) > 0.01) {
      throw new Error(
        `Credit card parser: sum ${sum.toFixed(2)} does not match Total desta fatura ${totalAmount.toFixed(2)}`,
      );
    }
  }

  extracted.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));

  return {
    extractedTransactions: extracted,
    futureInstallments: future,
    totalAmount,
    dueDate,
  };
}

export const itauCreditCardParser: Parser = {
  async parse(bytes) {
    const text = await extractText(bytes);
    return parseCreditCardText(text);
  },
  parseText(text) {
    return parseCreditCardText(text);
  },
};
