import fc from 'fast-check';
import type { ExtractedTransaction } from '../../../src/statements/parsers/types.js';

export const descriptionArb = fc
  .stringMatching(/^[A-Z][A-Z0-9 ]{2,20}$/)
  .filter((s) => !s.includes('SALDO'));

export const categoryArb = fc.constantFrom(
  'serviços',
  'alimentação',
  'transporte',
  'eletrônicos',
  'uncategorized',
);

export const dateArb = fc
  .integer({ min: 1, max: 28 })
  .chain((d) =>
    fc
      .integer({ min: 1, max: 12 })
      .map((m) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`),
  );

/**
 * Two-decimal BRL amount in [0.01, 99999.99] — keeps sum arithmetic stable
 * and avoids floating-point blow-ups at the conservation check.
 */
export const amountArb = fc
  .integer({ min: 1, max: 9_999_999 })
  .map((n) => Number((n / 100).toFixed(2)));

export const extractedTxArb: fc.Arbitrary<ExtractedTransaction> = fc.record({
  date: dateArb,
  description: descriptionArb,
  amount: amountArb,
  type: fc.constantFrom('INC', 'EXP'),
  source: fc.constantFrom('itau-black-1509', 'itau-black-0950', 'itau-corrente-9670-00293-1'),
  category: categoryArb,
}) as fc.Arbitrary<ExtractedTransaction>;

function brl(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const intPart = Math.floor(abs).toString();
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cents = Math.round((abs % 1) * 100).toString().padStart(2, '0');
  return `${sign}${withThousands},${cents}`;
}

export interface SyntheticBill {
  text: string;
  totalAmount: number;
  dueDate: string;
  rows: Array<{ dd: string; desc: string; amount: number; isRefund: boolean }>;
}

/**
 * Synthesizes a minimal Itaú credit-card PDF-text transcript whose Total desta
 * fatura matches the sum of extracted rows. Emits only domestic EXP + optional
 * refunds (no installments/IOF/intl) — enough to exercise conservation.
 */
export const syntheticBillArb: fc.Arbitrary<SyntheticBill> = fc
  .tuple(
    fc.array(
      fc.record({
        day: fc.integer({ min: 1, max: 28 }),
        desc: fc.stringMatching(/^[A-Z][A-Z0-9 ]{3,15}$/).filter((s) => !s.includes('SALDO')),
        cents: fc.integer({ min: 1, max: 500_000 }),
        refund: fc.boolean(),
      }),
      { minLength: 1, maxLength: 8 },
    ),
    fc.integer({ min: 1, max: 12 }).map((m) => String(m).padStart(2, '0')),
  )
  .map(([rows, month]) => {
    const normalized = rows.map((r) => ({
      dd: `${String(r.day).padStart(2, '0')}/${month}`,
      desc: r.desc,
      amount: Number((r.cents / 100).toFixed(2)),
      isRefund: r.refund,
    }));
    const total = normalized.reduce(
      (acc, r) => acc + (r.isRefund ? -r.amount : r.amount),
      0,
    );
    const totalAmount = Number(total.toFixed(2));
    const dueDate = `2026-${month}-20`;
    const lines = [
      `Postagem: 10/${month}/2026`,
      `Vencimento: 20/${month}/2026`,
      `Total desta fatura: R$ ${brl(totalAmount)}`,
      '',
      'Lançamentos no cartão (final 1509)',
    ];
    for (const r of normalized) {
      const value = r.isRefund ? -r.amount : r.amount;
      lines.push(`${r.dd} ${r.desc}  ${brl(value)}`);
      lines.push('serviços');
    }
    return { text: lines.join('\n'), totalAmount, dueDate, rows: normalized };
  });

export const SALDO_VARIANTS = [
  'SALDO ANTERIOR',
  'SALDO TOTAL DISPONÍVEL DIA',
  'SALDO DO DIA',
  'SALDO FINAL DO PERÍODO',
];

export interface SyntheticBankStmt {
  text: string;
  txRows: Array<{ date: string; description: string; amount: number; isExpense: boolean }>;
}

export const syntheticBankStmtArb: fc.Arbitrary<SyntheticBankStmt> = fc
  .array(
    fc.record({
      day: fc.integer({ min: 1, max: 28 }),
      month: fc.integer({ min: 1, max: 12 }),
      desc: fc.stringMatching(/^[A-Z][A-Z0-9 ]{3,15}$/).filter((s) => !s.includes('SALDO')),
      cents: fc.integer({ min: 1, max: 500_000 }),
      isExpense: fc.boolean(),
      saldoBefore: fc.boolean(),
      saldoVariant: fc.integer({ min: 0, max: SALDO_VARIANTS.length - 1 }),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((rows) => {
    const lines: string[] = ['extrato', 'agência: 9670  conta: 00293-1'];
    const txRows: SyntheticBankStmt['txRows'] = [];
    for (const r of rows) {
      const mm = String(r.month).padStart(2, '0');
      const dd = String(r.day).padStart(2, '0');
      const dateIso = `2026-${mm}-${dd}`;
      const dateBr = `${dd}/${mm}/2026`;
      const amount = Number((r.cents / 100).toFixed(2));
      if (r.saldoBefore) {
        lines.push(`${dateBr}  ${SALDO_VARIANTS[r.saldoVariant]}  ${brl(amount)}`);
      }
      const signed = r.isExpense ? -amount : amount;
      lines.push(`${dateBr}  ${r.desc}  ${brl(signed)}`);
      txRows.push({ date: dateIso, description: r.desc, amount, isExpense: r.isExpense });
    }
    return { text: lines.join('\n'), txRows };
  });
