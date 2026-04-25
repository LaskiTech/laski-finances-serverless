import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseBankAccountText, itauBankAccountParser } from '../../src/statements/parsers/itau-bank-account.js';
import type { ParseResult } from '../../src/statements/parsers/types.js';

const FIXTURES = new URL(
  '../../../../.kiro/specs/statement-import/fixtures/',
  import.meta.url,
);

const SAMPLE = `
extrato
agência: 9670  conta: 00293-1
01/04/2026  SALDO ANTERIOR  12345,67
01/04/2026  PIX TRANSF JOACIR 01/04  -15,00
20/04/2026  ITAU BLACK 3102-2305  -9.181,49
20/04/2026  PIX TRANSF KIOSHI 18/04  12.676,07
20/04/2026  SALDO TOTAL DISPONÍVEL DIA  3494,58
Aviso!
Os saldos acima são baseados em ...
30/04/2026  SHOULD NOT APPEAR  -99,99
`;

describe('parseBankAccountText (Itaú bank account)', () => {
  const result = parseBankAccountText(SAMPLE);

  it('derives source from the header', () => {
    expect(result.bankAccount).toBe('itau-corrente-9670-00293-1');
  });

  it('filters balance lines', () => {
    const descriptions = result.extractedTransactions.map((t) => t.description);
    expect(descriptions).not.toContain('SALDO ANTERIOR');
    expect(descriptions.some((d) => d.startsWith('SALDO'))).toBe(false);
  });

  it('produces the canonical EXP row for ITAU BLACK 3102-2305', () => {
    const row = result.extractedTransactions.find((t) =>
      t.description.startsWith('ITAU BLACK 3102-2305'),
    );
    expect(row).toBeDefined();
    expect(row!.amount).toBeCloseTo(9181.49, 2);
    expect(row!.type).toBe('EXP');
    expect(row!.date).toBe('2026-04-20');
    expect(row!.source).toBe('itau-corrente-9670-00293-1');
    expect(row!.category).toBe('uncategorized');
  });

  it('produces the canonical INC row for PIX TRANSF KIOSHI 18/04', () => {
    const row = result.extractedTransactions.find((t) =>
      t.description.startsWith('PIX TRANSF KIOSHI'),
    );
    expect(row).toBeDefined();
    expect(row!.amount).toBeCloseTo(12676.07, 2);
    expect(row!.type).toBe('INC');
  });

  it('stops at disclaimer footer', () => {
    const post = result.extractedTransactions.find((t) =>
      t.description.startsWith('SHOULD NOT APPEAR'),
    );
    expect(post).toBeUndefined();
  });

  it('sorts rows by date ascending', () => {
    const dates = result.extractedTransactions.map((t) => t.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});

// Task 0.1 / Requirement 3.8 — fixture-based canonical assertions against the real PDF
describe('itauBankAccountParser (fixture: extrato-lancamentos_conta.pdf)', () => {
  let fixture: ParseResult;

  beforeAll(async () => {
    const bytes = new Uint8Array(
      readFileSync(new URL('extrato-lancamentos_conta.pdf', FIXTURES)),
    );
    fixture = await itauBankAccountParser.parse(bytes);
  }, 30_000);

  it('derives source from the PDF header', () => {
    expect(fixture.bankAccount).toBe('itau-corrente-9670-00293-1');
  });

  it('emits the canonical EXP row for ITAU BLACK 3102-2305 (the bill-payment debit)', () => {
    const row = fixture.extractedTransactions.find((t) =>
      t.description.includes('ITAU BLACK 3102-2305'),
    );
    expect(row).toBeDefined();
    expect(row!.amount).toBeCloseTo(9181.49, 1);
    expect(row!.type).toBe('EXP');
    expect(row!.date).toBe('2026-04-20');
    expect(row!.source).toBe('itau-corrente-9670-00293-1');
    expect(row!.category).toBe('uncategorized');
  });

  it('emits the canonical INC row for PIX TRANSF KIOSHI 18/04', () => {
    const rows = fixture.extractedTransactions.filter((t) =>
      t.description.startsWith('PIX TRANSF KIOSHI'),
    );
    const row = rows.find((t) => t.amount > 10000);
    expect(row).toBeDefined();
    expect(row!.amount).toBeCloseTo(12676.07, 1);
    expect(row!.type).toBe('INC');
    expect(row!.date).toBe('2026-04-20');
  });

  it('emits the canonical EXP row for PIX TRANSF JOACIR 01/04', () => {
    const row = fixture.extractedTransactions.find((t) =>
      t.description.startsWith('PIX TRANSF JOACIR'),
    );
    expect(row).toBeDefined();
    expect(row!.amount).toBeCloseTo(15.00, 2);
    expect(row!.type).toBe('EXP');
    expect(row!.date).toBe('2026-04-01');
  });

  it('does not emit any SALDO rows', () => {
    const saldo = fixture.extractedTransactions.filter((t) =>
      t.description.toUpperCase().startsWith('SALDO'),
    );
    expect(saldo).toHaveLength(0);
  });
});
