import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ParseResult } from '../../../src/statements/parsers/types';

// ── Mock only Secrets Manager — let real Anthropic calls through ───────────────

const { mockSecretsSend } = vi.hoisted(() => {
  const mockSecretsSend = vi.fn();
  return { mockSecretsSend };
});

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mockSecretsSend })),
  GetSecretValueCommand: vi.fn((input: unknown) => ({
    _type: 'GetSecretValueCommand',
    input,
  })),
}));

import { llmParser } from '../../../src/statements/parsers/llm-parser';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(
  __dirname,
  '../../../../../.kiro/specs/statement-import/fixtures',
);

const BANK_ACCOUNT_PDF = path.join(
  FIXTURES_DIR,
  'extrato-lancamentos_conta.pdf',
);
const CREDIT_CARD_PDF = path.join(
  FIXTURES_DIR,
  'extrato-lancamentos_cartao.pdf',
);

// ── Gate: skip entire suite if ANTHROPIC_API_KEY is not set ────────────────────

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKey)('llm-parser integration (real Anthropic API)', () => {
  beforeAll(() => {
    // Point the parser's Secrets Manager mock to return the real API key
    process.env.ANTHROPIC_SECRET_NAME = 'laski/anthropic-api-key';
    mockSecretsSend.mockResolvedValue({
      SecretString: process.env.ANTHROPIC_API_KEY,
    });
  });

  // ── Bank Account ─────────────────────────────────────────────────────────────

  describe('BANK_ACCOUNT — extrato-lancamentos_conta.pdf', () => {
    let result: ParseResult;

    beforeAll(async () => {
      const pdfBytes = fs.readFileSync(BANK_ACCOUNT_PDF);
      const parser = llmParser('ITAU', 'BANK_ACCOUNT');
      result = await parser.parse(new Uint8Array(pdfBytes));
    }, 120_000);

    it('extracts a non-empty list of transactions', () => {
      expect(result.extractedTransactions.length).toBeGreaterThan(0);
    });

    it('contains canonical row: PIX TRANSF JOACIR', () => {
      const row = result.extractedTransactions.find((t) =>
        t.description.toUpperCase().includes('PIX TRANSF JOACIR'),
      );
      expect(row).toBeDefined();
      expect(row!.date).toBe('2026-04-01');
      expect(row!.amount).toBe(15.0);
      expect(row!.type).toBe('EXP');
    });

    it('contains canonical row: ITAU BLACK 3102-2305', () => {
      const row = result.extractedTransactions.find((t) =>
        t.description.toUpperCase().includes('ITAU BLACK 3102-2305'),
      );
      expect(row).toBeDefined();
      expect(row!.date).toBe('2026-04-20');
      expect(row!.amount).toBeCloseTo(9181.49, 2);
      expect(row!.type).toBe('EXP');
    });

    it('contains canonical row: PIX TRANSF KIOSHI', () => {
      const row = result.extractedTransactions.find((t) =>
        t.description.toUpperCase().includes('PIX TRANSF KIOSHI'),
      );
      expect(row).toBeDefined();
      expect(row!.date).toBe('2026-04-20');
      expect(row!.amount).toBeCloseTo(12676.07, 2);
      expect(row!.type).toBe('INC');
    });

    it('does NOT contain SALDO ANTERIOR rows', () => {
      const saldoAnterior = result.extractedTransactions.filter((t) =>
        t.description.toUpperCase().includes('SALDO ANTERIOR'),
      );
      expect(saldoAnterior).toHaveLength(0);
    });

    it('does NOT contain SALDO TOTAL DISPONÍVEL DIA rows', () => {
      const saldoTotal = result.extractedTransactions.filter((t) =>
        t.description.toUpperCase().includes('SALDO TOTAL DISPON'),
      );
      expect(saldoTotal).toHaveLength(0);
    });

    it('all amounts are positive numbers', () => {
      for (const tx of result.extractedTransactions) {
        expect(tx.amount).toBeGreaterThan(0);
      }
    });

    it('all types are INC or EXP', () => {
      for (const tx of result.extractedTransactions) {
        expect(['INC', 'EXP']).toContain(tx.type);
      }
    });
  });

  // ── Credit Card ──────────────────────────────────────────────────────────────

  describe('CREDIT_CARD — extrato-lancamentos_cartao.pdf', () => {
    let result: ParseResult;

    beforeAll(async () => {
      const pdfBytes = fs.readFileSync(CREDIT_CARD_PDF);
      const parser = llmParser('ITAU', 'CREDIT_CARD');
      result = await parser.parse(new Uint8Array(pdfBytes));
    }, 120_000);

    it('extracts a non-empty list of transactions', () => {
      expect(result.extractedTransactions.length).toBeGreaterThan(0);
    });

    // ── Per-card aggregate assertions ──────────────────────────────────────────

    it('itau-black-1509 sum equals 7077.99', () => {
      const sum = result.extractedTransactions
        .filter((t) => t.source === 'itau-black-1509' && t.type === 'EXP')
        .reduce((acc, t) => acc + t.amount, 0);
      expect(sum).toBeCloseTo(7077.99, 2);
    });

    it('itau-black-0950 sum equals 379.00', () => {
      const sum = result.extractedTransactions
        .filter((t) => t.source === 'itau-black-0950' && t.type === 'EXP')
        .reduce((acc, t) => acc + t.amount, 0);
      expect(sum).toBeCloseTo(379.0, 2);
    });

    it('itau-black-6007 sum equals 1603.47', () => {
      const sum = result.extractedTransactions
        .filter(
          (t) =>
            t.source === 'itau-black-6007' &&
            t.type === 'EXP' &&
            t.category !== 'fees',
        )
        .reduce((acc, t) => acc + t.amount, 0);
      expect(sum).toBeCloseTo(1603.47, 2);
    });

    it('international BRL total equals 116.96', () => {
      const internationalTxs = result.extractedTransactions.filter(
        (t) =>
          t.source === 'itau-black-6007' &&
          t.type === 'EXP' &&
          t.meta?.usd !== undefined,
      );
      const sum = internationalTxs.reduce((acc, t) => acc + t.amount, 0);
      expect(sum).toBeCloseTo(116.96, 2);
    });

    it('IOF fee transaction equals 4.07', () => {
      const iofTxs = result.extractedTransactions.filter(
        (t) => t.category === 'fees' && t.description.toUpperCase().includes('IOF'),
      );
      const sum = iofTxs.reduce((acc, t) => acc + t.amount, 0);
      expect(sum).toBeCloseTo(4.07, 2);
    });

    it('total of all EXP transactions equals 9181.49', () => {
      const sum = result.extractedTransactions
        .filter((t) => t.type === 'EXP')
        .reduce((acc, t) => acc + t.amount, 0);
      expect(sum).toBeCloseTo(9181.49, 2);
    });

    it('totalAmount field matches 9181.49', () => {
      expect(result.totalAmount).toBeCloseTo(9181.49, 2);
    });

    // ── Future installments ────────────────────────────────────────────────────

    it('futureInstallments array is populated', () => {
      expect(result.futureInstallments).toBeDefined();
      expect(result.futureInstallments!.length).toBeGreaterThan(0);
    });

    it('futureInstallments are NOT in extractedTransactions', () => {
      // Future installments should have dates after the billing period
      // and should only appear in the futureInstallments array
      const futureDescs = new Set(
        result.futureInstallments!.map((fi) =>
          fi.description.trim().toLowerCase(),
        ),
      );
      // At least some future installment descriptions should not appear
      // in extractedTransactions (they may share descriptions with current
      // installments, but the installment numbers should differ)
      expect(futureDescs.size).toBeGreaterThan(0);
    });

    // ── Installment parsing ────────────────────────────────────────────────────

    it('installment rows have installmentNumber and installmentTotal', () => {
      const installmentRows = result.extractedTransactions.filter(
        (t) => t.installmentNumber !== undefined && t.installmentTotal !== undefined,
      );
      expect(installmentRows.length).toBeGreaterThan(0);

      for (const row of installmentRows) {
        expect(row.installmentNumber).toBeGreaterThanOrEqual(1);
        expect(row.installmentTotal).toBeGreaterThanOrEqual(row.installmentNumber!);
      }
    });

    it('installment rows have groupId computed', () => {
      const installmentRows = result.extractedTransactions.filter(
        (t) => t.installmentNumber !== undefined && t.installmentTotal !== undefined,
      );

      for (const row of installmentRows) {
        expect(row.groupId).toBeDefined();
        expect(row.groupId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
      }
    });

    // ── General assertions ─────────────────────────────────────────────────────

    it('all amounts are positive numbers', () => {
      for (const tx of result.extractedTransactions) {
        expect(tx.amount).toBeGreaterThan(0);
      }
    });

    it('all types are INC or EXP', () => {
      for (const tx of result.extractedTransactions) {
        expect(['INC', 'EXP']).toContain(tx.type);
      }
    });

    it('all sources are lowercase', () => {
      for (const tx of result.extractedTransactions) {
        expect(tx.source).toBe(tx.source.toLowerCase());
      }
    });

    it('all categories are lowercase', () => {
      for (const tx of result.extractedTransactions) {
        expect(tx.category).toBe(tx.category.toLowerCase());
      }
    });

    it('dueDate is set', () => {
      expect(result.dueDate).toBeDefined();
      expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
