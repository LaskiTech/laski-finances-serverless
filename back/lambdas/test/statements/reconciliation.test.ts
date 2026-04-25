import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconcile, BILL_PAYMENT_RE } from '../../src/statements/services/reconciliation.js';
import type { ExtractedTransaction } from '../../src/statements/parsers/types.js';

interface MockClient {
  send: ReturnType<typeof vi.fn>;
}

function makeClient(): MockClient {
  return { send: vi.fn() };
}

function row(overrides: Partial<ExtractedTransaction> = {}): ExtractedTransaction {
  return {
    date: '2026-04-20',
    description: 'ITAU BLACK 3102-2305',
    amount: 9181.49,
    type: 'EXP',
    source: 'itau-corrente-9670-00293-1',
    category: 'uncategorized',
    ...overrides,
  };
}

describe('BILL_PAYMENT_RE', () => {
  it.each([
    'ITAU BLACK 3102-2305',
    'PAG FATURA CARTAO',
    'FATURA CARTAO ITAU',
    'PAGAMENTO CARTAO',
  ])('matches bill-payment description %s', (desc) => {
    expect(BILL_PAYMENT_RE.test(desc)).toBe(true);
  });

  it.each([
    'PIX TRANSF JOACIR',
    'SUPERMERCADO X',
    'NETFLIX.COM',
  ])('does not match unrelated description %s', (desc) => {
    expect(BILL_PAYMENT_RE.test(desc)).toBe(false);
  });
});

describe('reconcile (CREDIT_CARD flow)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  const stmt = {
    statementId: 'stmt-cc-1',
    documentType: 'CREDIT_CARD' as const,
    pk: 'USER#user-123',
  };

  it('returns a high-confidence candidate when exactly one bill payment matches', async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      Items: [
        {
          sk: 'TRANS#2026-04#EXP#abc',
          description: 'ITAU BLACK 3102-2305',
          date: '2026-04-20',
          amount: 9181.49,
        },
      ],
    });

    const result = await reconcile(
      stmt,
      { extractedTransactions: [], totalAmount: 9181.49, dueDate: '2026-04-20' },
      { client: client as never, ledgerTableName: 'laskifin-Ledger', statementsTableName: 'laskifin-Statements' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe('high');
    expect(result[0].parentSk).toBe('TRANS#2026-04#EXP#abc');
    expect(result[0].totalAmount).toBeCloseTo(9181.49, 2);
    expect(result[0].dateWindow).toEqual({ from: '2026-04-17', to: '2026-04-23' });
  });

  it('returns an ambiguous candidate when multiple bill payments match', async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      Items: [
        { sk: 'TRANS#2026-04#EXP#a', description: 'ITAU BLACK 3102-2305', date: '2026-04-20', amount: 9181.49 },
        { sk: 'TRANS#2026-04#EXP#b', description: 'PAG FATURA CARTAO', date: '2026-04-21', amount: 9181.49 },
      ],
    });

    const result = await reconcile(
      stmt,
      { extractedTransactions: [], totalAmount: 9181.49, dueDate: '2026-04-20' },
      { client: client as never, ledgerTableName: 'laskifin-Ledger', statementsTableName: 'laskifin-Statements' },
    );

    expect(result[0].confidence).toBe('ambiguous');
    expect(result[0].candidateParents).toHaveLength(2);
  });

  it('returns a "none" candidate when no bill payments are found', async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({ Items: [] });

    const result = await reconcile(
      stmt,
      { extractedTransactions: [], totalAmount: 9181.49, dueDate: '2026-04-20' },
      { client: client as never, ledgerTableName: 'laskifin-Ledger', statementsTableName: 'laskifin-Statements' },
    );

    expect(result[0].confidence).toBe('none');
    expect(result[0].parentSk).toBeUndefined();
  });

  it('returns [] when totalAmount or dueDate is missing', async () => {
    const client = makeClient();
    const result = await reconcile(
      stmt,
      { extractedTransactions: [] },
      { client: client as never, ledgerTableName: 'L', statementsTableName: 'S' },
    );
    expect(result).toEqual([]);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('filters bill-payment candidates that do not match the description pattern', async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      Items: [
        { sk: 'TRANS#2026-04#EXP#x', description: 'SUPERMERCADO', date: '2026-04-20', amount: 9181.49 },
      ],
    });

    const result = await reconcile(
      stmt,
      { extractedTransactions: [], totalAmount: 9181.49, dueDate: '2026-04-20' },
      { client: client as never, ledgerTableName: 'laskifin-Ledger', statementsTableName: 'laskifin-Statements' },
    );

    expect(result[0].confidence).toBe('none');
  });
});

describe('reconcile (BANK_ACCOUNT flow)', () => {
  const stmt = {
    statementId: 'stmt-ba-1',
    documentType: 'BANK_ACCOUNT' as const,
    pk: 'USER#user-123',
  };

  it('returns one candidate per bill-payment row', async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({
      Items: [
        {
          statementId: 'cc-stmt',
          sk: 'STATEMENT#cc',
          totalAmount: 9181.49,
          dueDate: '2026-04-20',
          documentTypeDueDate: 'CREDIT_CARD#2026-04-20',
        },
      ],
    });

    const rows: ExtractedTransaction[] = [
      row(),
      row({ description: 'PIX TRANSF KIOSHI 18/04', amount: 100, type: 'INC' }),
    ];

    const result = await reconcile(
      stmt,
      { extractedTransactions: rows },
      { client: client as never, ledgerTableName: 'laskifin-Ledger', statementsTableName: 'laskifin-Statements' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe('high');
    expect(result[0].childStatementId).toBe('cc-stmt');
  });

  it('emits "none" when the matching credit-card statement is absent', async () => {
    const client = makeClient();
    client.send.mockResolvedValueOnce({ Items: [] });

    const result = await reconcile(
      stmt,
      { extractedTransactions: [row()] },
      { client: client as never, ledgerTableName: 'laskifin-Ledger', statementsTableName: 'laskifin-Statements' },
    );

    expect(result[0].confidence).toBe('none');
  });
});
