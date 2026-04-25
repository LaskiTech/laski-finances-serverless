import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v5 as uuidv5 } from 'uuid';
import type { ParseResult, ExtractedTransaction } from '../../../src/statements/parsers/types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockCreate, mockSecretsSend } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockSecretsSend = vi.fn();
  return { mockCreate, mockSecretsSend };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({ send: mockSecretsSend })),
  GetSecretValueCommand: vi.fn((input: unknown) => ({ _type: 'GetSecretValueCommand', input })),
}));

import {
  buildSystemPrompt,
  validateAndPostProcess,
  checkConservation,
  llmParser,
} from '../../../src/statements/parsers/llm-parser';

// ── Constants ──────────────────────────────────────────────────────────────────

const NAMESPACE_INSTALLMENT = 'a5b8f9c4-1b2e-4dab-9b6f-cd3b3f0c0001';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeValidParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    extractedTransactions: [
      {
        date: '2026-04-10',
        description: 'Grocery Store',
        amount: 150.0,
        type: 'EXP',
        source: 'itau-corrente-1234-56789-0',
        category: 'food',
      },
      {
        date: '2026-04-05',
        description: 'Salary Deposit',
        amount: 5000.0,
        type: 'INC',
        source: 'itau-corrente-1234-56789-0',
        category: 'salary',
      },
    ],
    ...overrides,
  };
}

function makeAnthropicResponse(
  jsonBody: unknown,
  inputTokens = 1000,
  outputTokens = 500,
) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(jsonBody),
      },
    ],
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  it('returns a prompt containing BANK_ACCOUNT extraction rules', () => {
    const prompt = buildSystemPrompt('ITAU', 'BANK_ACCOUNT');
    expect(prompt).toContain('BANK_ACCOUNT');
    expect(prompt).toContain('Extraction rules for BANK_ACCOUNT');
    expect(prompt).toContain('SALDO ANTERIOR');
    expect(prompt).not.toContain('Extraction rules for CREDIT_CARD');
  });

  it('returns a prompt containing CREDIT_CARD extraction rules', () => {
    const prompt = buildSystemPrompt('ITAU', 'CREDIT_CARD');
    expect(prompt).toContain('CREDIT_CARD');
    expect(prompt).toContain('Extraction rules for CREDIT_CARD');
    expect(prompt).toContain('futureInstallments');
    expect(prompt).not.toContain('Extraction rules for BANK_ACCOUNT');
  });

  it('includes the bank name in the prompt', () => {
    const prompt = buildSystemPrompt('ITAU', 'BANK_ACCOUNT');
    expect(prompt).toContain('Bank: ITAU');
  });
});

describe('validateAndPostProcess', () => {
  it('passes validation for a well-formed ParseResult', () => {
    const raw = makeValidParseResult();
    const result = validateAndPostProcess(raw);
    expect(result.extractedTransactions).toHaveLength(2);
  });

  it('throws ZodError for missing required fields', () => {
    const raw = {
      extractedTransactions: [
        {
          date: '2026-04-10',
          // missing description, amount, type, source, category
        },
      ],
    };
    expect(() => validateAndPostProcess(raw)).toThrow();
  });

  it('throws ZodError when extractedTransactions is not an array', () => {
    const raw = { extractedTransactions: 'not-an-array' };
    expect(() => validateAndPostProcess(raw)).toThrow();
  });

  it('throws ZodError for invalid type enum value', () => {
    const raw = makeValidParseResult();
    (raw.extractedTransactions[0] as Record<string, unknown>).type = 'INVALID';
    expect(() => validateAndPostProcess(raw)).toThrow();
  });

  it('sorts transactions by date ascending', () => {
    const raw = makeValidParseResult({
      extractedTransactions: [
        { date: '2026-04-15', description: 'C', amount: 30, type: 'EXP', source: 's', category: 'c' },
        { date: '2026-04-01', description: 'A', amount: 10, type: 'EXP', source: 's', category: 'c' },
        { date: '2026-04-10', description: 'B', amount: 20, type: 'EXP', source: 's', category: 'c' },
      ],
    });

    const result = validateAndPostProcess(raw);
    expect(result.extractedTransactions.map((t) => t.description)).toEqual(['A', 'B', 'C']);
  });

  it('normalises source to trimmed lowercase', () => {
    const raw = makeValidParseResult({
      extractedTransactions: [
        { date: '2026-04-01', description: 'Test', amount: 10, type: 'EXP', source: '  Itau-Black-1234  ', category: 'food' },
      ],
    });

    const result = validateAndPostProcess(raw);
    expect(result.extractedTransactions[0].source).toBe('itau-black-1234');
  });

  it('normalises category to trimmed lowercase', () => {
    const raw = makeValidParseResult({
      extractedTransactions: [
        { date: '2026-04-01', description: 'Test', amount: 10, type: 'EXP', source: 's', category: '  ALIMENTAÇÃO  ' },
      ],
    });

    const result = validateAndPostProcess(raw);
    expect(result.extractedTransactions[0].category).toBe('alimentação');
  });

  it('ensures amount is always Math.abs(value)', () => {
    const raw = makeValidParseResult({
      extractedTransactions: [
        { date: '2026-04-01', description: 'Negative', amount: -99.5, type: 'EXP', source: 's', category: 'c' },
      ],
    });

    const result = validateAndPostProcess(raw);
    expect(result.extractedTransactions[0].amount).toBe(99.5);
  });

  it('computes groupId for installment rows via uuidv5', () => {
    const raw = makeValidParseResult({
      extractedTransactions: [
        {
          date: '2026-03-15',
          description: 'Samsung No Itau',
          amount: 100,
          type: 'EXP',
          source: 'itau-black-1234',
          category: 'electronics',
          installmentNumber: 3,
          installmentTotal: 12,
        },
      ],
    });

    const result = validateAndPostProcess(raw);
    const tx = result.extractedTransactions[0];

    const expectedGroupId = uuidv5(
      'samsung no itau|2026-03-15',
      NAMESPACE_INSTALLMENT,
    );
    expect(tx.groupId).toBe(expectedGroupId);
  });

  it('does not overwrite an existing groupId', () => {
    const raw = makeValidParseResult({
      extractedTransactions: [
        {
          date: '2026-03-15',
          description: 'Samsung',
          amount: 100,
          type: 'EXP',
          source: 's',
          category: 'c',
          installmentNumber: 1,
          installmentTotal: 3,
          groupId: 'existing-group-id',
        },
      ],
    });

    const result = validateAndPostProcess(raw);
    expect(result.extractedTransactions[0].groupId).toBe('existing-group-id');
  });

  it('does not compute groupId for non-installment rows', () => {
    const raw = makeValidParseResult({
      extractedTransactions: [
        { date: '2026-04-01', description: 'Regular', amount: 50, type: 'EXP', source: 's', category: 'c' },
      ],
    });

    const result = validateAndPostProcess(raw);
    expect(result.extractedTransactions[0].groupId).toBeUndefined();
  });

  it('normalises futureInstallments source and amount', () => {
    const raw = makeValidParseResult({
      futureInstallments: [
        {
          date: '2026-05-20',
          description: 'Future Purchase',
          amount: -200,
          source: '  Itau-Black-5678  ',
          installmentNumber: 2,
          installmentTotal: 6,
        },
      ],
    });

    const result = validateAndPostProcess(raw);
    expect(result.futureInstallments![0].source).toBe('itau-black-5678');
    expect(result.futureInstallments![0].amount).toBe(200);
  });
});

describe('checkConservation', () => {
  it('passes when sum matches totalAmount within 0.01', () => {
    const txs: ExtractedTransaction[] = [
      { date: '2026-04-01', description: 'A', amount: 100, type: 'EXP', source: 's', category: 'c' },
      { date: '2026-04-02', description: 'B', amount: 50, type: 'EXP', source: 's', category: 'c' },
    ];
    // sum of EXP = 150
    expect(() => checkConservation(txs, 150)).not.toThrow();
  });

  it('passes when sum matches totalAmount within floating point tolerance', () => {
    const txs: ExtractedTransaction[] = [
      { date: '2026-04-01', description: 'A', amount: 33.33, type: 'EXP', source: 's', category: 'c' },
      { date: '2026-04-02', description: 'B', amount: 33.33, type: 'EXP', source: 's', category: 'c' },
      { date: '2026-04-03', description: 'C', amount: 33.34, type: 'EXP', source: 's', category: 'c' },
    ];
    // sum = 100.00
    expect(() => checkConservation(txs, 100.0)).not.toThrow();
  });

  it('throws when sum does not match totalAmount', () => {
    const txs: ExtractedTransaction[] = [
      { date: '2026-04-01', description: 'A', amount: 100, type: 'EXP', source: 's', category: 'c' },
    ];
    expect(() => checkConservation(txs, 200)).toThrow('Conservation check failed');
  });

  it('does nothing when totalAmount is undefined', () => {
    const txs: ExtractedTransaction[] = [
      { date: '2026-04-01', description: 'A', amount: 100, type: 'EXP', source: 's', category: 'c' },
    ];
    expect(() => checkConservation(txs, undefined)).not.toThrow();
  });

  it('accounts for INC transactions as negative in the sum', () => {
    const txs: ExtractedTransaction[] = [
      { date: '2026-04-01', description: 'Charge', amount: 200, type: 'EXP', source: 's', category: 'c' },
      { date: '2026-04-02', description: 'Refund', amount: 50, type: 'INC', source: 's', category: 'c' },
    ];
    // sum = 200 - 50 = 150
    expect(() => checkConservation(txs, 150)).not.toThrow();
    expect(() => checkConservation(txs, 200)).toThrow('Conservation check failed');
  });
});

describe('llmParser factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ANTHROPIC_SECRET_NAME', 'laski/anthropic-api-key');
    mockSecretsSend.mockResolvedValue({ SecretString: 'fake-api-key' });
  });

  it('parses a valid LLM response successfully', async () => {
    const validResult = makeValidParseResult();
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(validResult, 2000, 800));

    const parser = llmParser('ITAU', 'BANK_ACCOUNT');
    const result = await parser.parse(new Uint8Array([1, 2, 3]));

    expect(result.extractedTransactions).toHaveLength(2);
    // Verify sorting: 2026-04-05 before 2026-04-10
    expect(result.extractedTransactions[0].date).toBe('2026-04-05');
    expect(result.extractedTransactions[1].date).toBe('2026-04-10');
  });

  it('retries on Zod validation failure and succeeds on second attempt', async () => {
    const invalidResult = {
      extractedTransactions: [
        { date: '2026-04-01', description: 'Bad', amount: 10 },
        // missing type, source, category
      ],
    };
    const validResult = makeValidParseResult();

    mockCreate
      .mockResolvedValueOnce(makeAnthropicResponse(invalidResult, 1000, 400))
      .mockResolvedValueOnce(makeAnthropicResponse(validResult, 1500, 600));

    const parser = llmParser('ITAU', 'BANK_ACCOUNT');
    const result = await parser.parse(new Uint8Array([1, 2, 3]));

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.extractedTransactions).toHaveLength(2);
  });

  it('throws when both attempts fail Zod validation', async () => {
    const invalidResult = {
      extractedTransactions: [
        { date: '2026-04-01' },
      ],
    };

    mockCreate
      .mockResolvedValue(makeAnthropicResponse(invalidResult, 1000, 400));

    const parser = llmParser('ITAU', 'BANK_ACCOUNT');
    await expect(parser.parse(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('logs token usage with correct values', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const validResult = makeValidParseResult();
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(validResult, 3500, 1200));

    const parser = llmParser('ITAU', 'CREDIT_CARD');
    await parser.parse(new Uint8Array([1, 2, 3]));

    const tokenLogCall = consoleSpy.mock.calls.find((call) => {
      const parsed = JSON.parse(call[0] as string);
      return parsed.message === 'Anthropic API token usage';
    });

    expect(tokenLogCall).toBeDefined();
    const logData = JSON.parse(tokenLogCall![0] as string);
    expect(logData.input_tokens).toBe(3500);
    expect(logData.output_tokens).toBe(1200);
    expect(logData.bank).toBe('ITAU');
    expect(logData.documentType).toBe('CREDIT_CARD');

    consoleSpy.mockRestore();
  });

  it('logs token usage for both attempts on validation retry', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const invalidResult = { extractedTransactions: [{ date: '2026-04-01' }] };
    const validResult = makeValidParseResult();

    mockCreate
      .mockResolvedValueOnce(makeAnthropicResponse(invalidResult, 1000, 400))
      .mockResolvedValueOnce(makeAnthropicResponse(validResult, 1500, 600));

    const parser = llmParser('ITAU', 'BANK_ACCOUNT');
    await parser.parse(new Uint8Array([1, 2, 3]));

    const tokenLogs = consoleSpy.mock.calls.filter((call) => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return parsed.message?.includes('Anthropic API token usage');
      } catch {
        return false;
      }
    });

    expect(tokenLogs).toHaveLength(2);

    const firstLog = JSON.parse(tokenLogs[0][0] as string);
    expect(firstLog.input_tokens).toBe(1000);
    expect(firstLog.output_tokens).toBe(400);

    const retryLog = JSON.parse(tokenLogs[1][0] as string);
    expect(retryLog.input_tokens).toBe(1500);
    expect(retryLog.output_tokens).toBe(600);
    expect(retryLog.message).toContain('validation retry');

    consoleSpy.mockRestore();
  });

  it('runs conservation check and throws on mismatch for credit card', async () => {
    const result: ParseResult = {
      extractedTransactions: [
        { date: '2026-04-01', description: 'A', amount: 100, type: 'EXP', source: 's', category: 'c' },
      ],
      totalAmount: 999, // mismatch
    };
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(result, 1000, 500));

    const parser = llmParser('ITAU', 'CREDIT_CARD');
    await expect(parser.parse(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'Conservation check failed',
    );
  });

  it('passes conservation check when totalAmount matches', async () => {
    const result: ParseResult = {
      extractedTransactions: [
        { date: '2026-04-01', description: 'A', amount: 100, type: 'EXP', source: 's', category: 'c' },
        { date: '2026-04-02', description: 'B', amount: 50, type: 'EXP', source: 's', category: 'c' },
      ],
      totalAmount: 150,
    };
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(result, 1000, 500));

    const parser = llmParser('ITAU', 'CREDIT_CARD');
    const parsed = await parser.parse(new Uint8Array([1, 2, 3]));
    expect(parsed.extractedTransactions).toHaveLength(2);
  });

  it('strips markdown code fences from LLM response', async () => {
    const validResult = makeValidParseResult();
    const fencedResponse = {
      content: [
        {
          type: 'text' as const,
          text: '```json\n' + JSON.stringify(validResult) + '\n```',
        },
      ],
      usage: { input_tokens: 1000, output_tokens: 500 },
    };
    mockCreate.mockResolvedValueOnce(fencedResponse);

    const parser = llmParser('ITAU', 'BANK_ACCOUNT');
    const result = await parser.parse(new Uint8Array([1, 2, 3]));
    expect(result.extractedTransactions).toHaveLength(2);
  });

  it('calls Anthropic with correct model and parameters', async () => {
    const validResult = makeValidParseResult();
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(validResult, 1000, 500));

    const parser = llmParser('ITAU', 'BANK_ACCOUNT');
    await parser.parse(new Uint8Array([1, 2, 3]));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        temperature: 0,
      }),
    );
  });

  it('sends PDF as base64 document content block', async () => {
    const validResult = makeValidParseResult();
    mockCreate.mockResolvedValueOnce(makeAnthropicResponse(validResult, 1000, 500));

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const parser = llmParser('ITAU', 'BANK_ACCOUNT');
    await parser.parse(pdfBytes);

    const callArgs = mockCreate.mock.calls[0][0];
    const docBlock = callArgs.messages[0].content[0];
    expect(docBlock.type).toBe('document');
    expect(docBlock.source.type).toBe('base64');
    expect(docBlock.source.media_type).toBe('application/pdf');
    expect(docBlock.source.data).toBe(Buffer.from(pdfBytes).toString('base64'));
  });
});
