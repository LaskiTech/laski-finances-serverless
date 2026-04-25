import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseCreditCardText, itauCreditCardParser } from '../../src/statements/parsers/itau-credit-card.js';
import type { ExtractedTransaction, ParseResult } from '../../src/statements/parsers/types.js';

const FIXTURES = new URL(
  '../../../../.kiro/specs/statement-import/fixtures/',
  import.meta.url,
);

const SAMPLE = `
Postagem: 10/04/2026
Vencimento: 20/04/2026
Total desta fatura: R$ 200,00

Lançamentos no cartão (final 1509)
05/04 NETFLIX.COM  50,00
serviços
06/04 SAMSUNG NO ITAU 10/21  100,00
eletrônicos
07/04 REEMBOLSO  -10,00
estorno

Lançamentos no cartão (final 0950)
Lançamentos internacionais
08/04 OPENAI LLC  5,00  30,00
tecnologia
Repasse de IOF  30,00

Compras parceladas - próximas faturas
05/05 SAMSUNG NO ITAU 11/21  100,00
eletrônicos
`;

describe('parseCreditCardText (Itaú credit card)', () => {
  const result = parseCreditCardText(SAMPLE);

  it('extracts header totals and due date', () => {
    expect(result.totalAmount).toBeCloseTo(200, 2);
    expect(result.dueDate).toBe('2026-04-20');
  });

  it('satisfies the conservation check against Total desta fatura', () => {
    const sum = result.extractedTransactions.reduce(
      (acc, t) => acc + (t.type === 'EXP' ? t.amount : -t.amount),
      0,
    );
    expect(sum).toBeCloseTo(result.totalAmount!, 2);
  });

  it('attributes domestic rows to the correct per-card source', () => {
    const netflix = result.extractedTransactions.find((t) =>
      t.description.startsWith('NETFLIX'),
    );
    expect(netflix?.source).toBe('itau-black-1509');
    expect(netflix?.amount).toBeCloseTo(50, 2);
    expect(netflix?.type).toBe('EXP');
    expect(netflix?.date).toBe('2026-04-05');
    expect(netflix?.category).toBe('serviços');
  });

  it('parses installment suffix and strips it from description', () => {
    const samsung = result.extractedTransactions.find((t) =>
      t.description === 'SAMSUNG NO ITAU' && t.installmentNumber === 10,
    );
    expect(samsung).toBeDefined();
    expect(samsung?.installmentTotal).toBe(21);
    expect(samsung?.groupId).toBeDefined();
    expect(samsung?.amount).toBeCloseTo(100, 2);
    expect(samsung?.source).toBe('itau-black-1509');
  });

  it('emits a refund as INC when the raw value is negative', () => {
    const refund = result.extractedTransactions.find((t) =>
      t.description.startsWith('REEMBOLSO'),
    );
    expect(refund?.type).toBe('INC');
    expect(refund?.amount).toBeCloseTo(10, 2);
  });

  it('parses international rows with USD/BRL meta', () => {
    const openai = result.extractedTransactions.find((t) =>
      t.description.startsWith('OPENAI'),
    );
    expect(openai).toBeDefined();
    expect(openai?.source).toBe('itau-black-0950');
    expect(openai?.type).toBe('EXP');
    expect(openai?.amount).toBeCloseTo(30, 2);
    expect(openai?.meta).toEqual({ usd: 5, brl: 30 });
  });

  it('emits a synthetic IOF expense row in the international section', () => {
    const iof = result.extractedTransactions.find((t) =>
      t.description.startsWith('IOF'),
    );
    expect(iof).toBeDefined();
    expect(iof?.type).toBe('EXP');
    expect(iof?.amount).toBeCloseTo(30, 2);
    expect(iof?.category).toBe('fees');
    expect(iof?.source).toBe('itau-black-0950');
  });

  it('routes future installments to futureInstallments[] (not extractedTransactions)', () => {
    const futureIn = result.extractedTransactions.find(
      (t) => t.installmentNumber === 11,
    );
    expect(futureIn).toBeUndefined();

    const preview = result.futureInstallments!.find(
      (p) => p.installmentNumber === 11,
    );
    expect(preview).toBeDefined();
    expect(preview?.description).toBe('SAMSUNG NO ITAU');
    expect(preview?.installmentTotal).toBe(21);
    expect(preview?.amount).toBeCloseTo(100, 2);
    expect(preview?.date).toBe('2026-05-05');
  });

  it('sorts extracted transactions by date ascending', () => {
    const dates = result.extractedTransactions.map((t) => t.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('throws when sum mismatches the header total', () => {
    const broken = SAMPLE.replace('Total desta fatura: R$ 200,00', 'Total desta fatura: R$ 999,00');
    expect(() => parseCreditCardText(broken)).toThrow(/Total desta fatura/);
  });
});

// Task 0.1 / Requirement 4.9 — fixture-based canonical assertions against the real PDF
describe('itauCreditCardParser (fixture: extrato-lancamentos_cartao.pdf)', () => {
  let fixture: ParseResult;

  beforeAll(async () => {
    const bytes = new Uint8Array(
      readFileSync(new URL('extrato-lancamentos_cartao.pdf', FIXTURES)),
    );
    fixture = await itauCreditCardParser.parse(bytes);
  }, 30_000);

  function expSum(
    txs: ExtractedTransaction[],
    filter: (t: ExtractedTransaction) => boolean,
  ): number {
    return txs
      .filter((t) => t.type === 'EXP' && filter(t))
      .reduce((s, t) => s + t.amount, 0);
  }

  it('parses the bill total from the header', () => {
    expect(fixture.totalAmount).toBeCloseTo(9181.49, 1);
  });

  it('grand EXP sum equals the bill total (conservation)', () => {
    const sum = fixture.extractedTransactions.reduce(
      (acc, t) => acc + (t.type === 'EXP' ? t.amount : -t.amount),
      0,
    );
    expect(sum).toBeCloseTo(fixture.totalAmount!, 1);
  });

  it('itau-black-1509 EXP aggregate = 7077.99 (Requirement 4.9)', () => {
    expect(expSum(fixture.extractedTransactions, (t) => t.source === 'itau-black-1509')).toBeCloseTo(7077.99, 1);
  });

  it('itau-black-0950 EXP aggregate = 379.00 (Requirement 4.9)', () => {
    expect(expSum(fixture.extractedTransactions, (t) => t.source === 'itau-black-0950')).toBeCloseTo(379.00, 1);
  });

  it('itau-black-6007 domestic EXP aggregate = 1603.47 (Requirement 4.9)', () => {
    expect(
      expSum(fixture.extractedTransactions, (t) => t.source === 'itau-black-6007' && !t.meta && t.category !== 'fees'),
    ).toBeCloseTo(1603.47, 1);
  });

  it('itau-black-6007 international EXP aggregate = 116.96 (Requirement 4.9)', () => {
    expect(
      expSum(fixture.extractedTransactions, (t) => t.source === 'itau-black-6007' && !!t.meta),
    ).toBeCloseTo(116.96, 1);
  });

  it('IOF fee total = 4.07 (Requirement 4.9)', () => {
    expect(
      expSum(fixture.extractedTransactions, (t) => t.category === 'fees'),
    ).toBeCloseTo(4.07, 1);
  });

  it('does not emit balance/summary lines', () => {
    const bad = fixture.extractedTransactions.filter((t) =>
      /^(total esta fatura|pagamento efetuado|saldo)/i.test(t.description),
    );
    expect(bad).toHaveLength(0);
  });

  it('sets dueDate to 2026-04-20', () => {
    expect(fixture.dueDate).toBe('2026-04-20');
  });
});
