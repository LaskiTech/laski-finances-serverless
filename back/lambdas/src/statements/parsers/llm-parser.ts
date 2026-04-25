import Anthropic from '@anthropic-ai/sdk';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import type {
  BankId,
  DocumentType,
  ExtractedInstallmentPreview,
  ExtractedTransaction,
  ParseResult,
  Parser,
} from './types';

// ── Constants ──────────────────────────────────────────────────────────────────

const NAMESPACE_INSTALLMENT = 'a5b8f9c4-1b2e-4dab-9b6f-cd3b3f0c0001';

// ── Zod schemas ────────────────────────────────────────────────────────────────

const ExtractedTransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  type: z.enum(['INC', 'EXP']),
  source: z.string(),
  category: z.string(),
  installmentNumber: z.number().optional(),
  installmentTotal: z.number().optional(),
  groupId: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const ExtractedInstallmentPreviewSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  source: z.string(),
  installmentNumber: z.number(),
  installmentTotal: z.number(),
});

const ParseResultSchema = z.object({
  extractedTransactions: z.array(ExtractedTransactionSchema),
  futureInstallments: z.array(ExtractedInstallmentPreviewSchema).optional(),
  totalAmount: z.number().optional(),
  dueDate: z.string().optional(),
  bankAccount: z.string().optional(),
});

// ── Secrets Manager caching ────────────────────────────────────────────────────

const secretsClient = new SecretsManagerClient({});
let cachedApiKey: string | null = null;

async function getAnthropicApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;

  const secretName = process.env.ANTHROPIC_SECRET_NAME;
  if (!secretName) {
    throw new Error('ANTHROPIC_SECRET_NAME environment variable is not set');
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );

  if (!result.SecretString) {
    throw new Error('Anthropic API key secret is empty');
  }

  cachedApiKey = result.SecretString;
  return cachedApiKey;
}

// ── System prompt builder ──────────────────────────────────────────────────────

export function buildSystemPrompt(bank: BankId, documentType: DocumentType): string {
  const basePrompt = `You are a financial document parser. Extract every transaction from the uploaded PDF.

## Document context
- Bank: ${bank}
- Document type: ${documentType}

## Output schema
Return a single JSON object (no markdown fences, no explanation) with these fields:

{
  "extractedTransactions": [
    {
      "date": "YYYY-MM-DD",        // ISO 8601 date
      "description": "string",      // transaction description
      "amount": number,             // always positive — sign is encoded in "type"
      "type": "INC" | "EXP",       // INC = income/credit, EXP = expense/debit
      "source": "string",           // account or card identifier (lowercase, dashes)
      "category": "string",         // category from document or "uncategorized"
      "installmentNumber": number,  // optional — current installment index (1-based)
      "installmentTotal": number,   // optional — total installments
      "groupId": "string",          // optional — deterministic UUID for installment grouping
      "meta": {}                    // optional — extra data (e.g. USD amount, conversion rate)
    }
  ],
  "futureInstallments": [           // optional — only for CREDIT_CARD
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": number,
      "source": "string",
      "installmentNumber": number,
      "installmentTotal": number
    }
  ],
  "totalAmount": number,            // optional — credit card "Total desta fatura"
  "dueDate": "YYYY-MM-DD",         // optional — credit card due date
  "bankAccount": "string"           // optional — bank account identifier
}`;

  if (documentType === 'BANK_ACCOUNT') {
    return `${basePrompt}

## Extraction rules for BANK_ACCOUNT

1. **Source**: Extract the account identifier from the document header (e.g. "agência: NNNN  conta: NNNNN-N"). Format as a slug: "itau-corrente-<agencia>-<conta>" (lowercase, dashes, no spaces). Set this as the "source" for ALL rows.

2. **Amount and type**: 
   - Negative values (debits) → type = "EXP", amount = Math.abs(value)
   - Positive values (credits) → type = "INC", amount = value
   - The "amount" field must ALWAYS be a positive number.

3. **Category**: Set category = "uncategorized" for ALL rows.

4. **Dates**: Convert dates from DD/MM/YYYY format to ISO YYYY-MM-DD.

5. **Ordering**: Return transactions in chronological order (date ascending), preserving the order they appear in the document for same-date entries.

## Exclusion rules — do NOT include these lines:
- SALDO ANTERIOR
- SALDO TOTAL DISPONÍVEL DIA
- SALDO DO DIA
- SALDO FINAL DO PERÍODO
- Any balance line, summary line, header, footer, or disclaimer
- Any line that is not an actual financial transaction`;
  }

  // CREDIT_CARD
  return `${basePrompt}

## Extraction rules for CREDIT_CARD

1. **Source**: Recognise plastic-card section headers (e.g. "KIOSHI IOSIMUTA (final NNNN)") and set source to "itau-black-<NNNN>" (lowercase) for all subsequent transactions until the next card header.

2. **Category**: Extract the category from the line immediately below each transaction (e.g. "ALIMENTAÇÃO .FORTALEZA"). Strip the city suffix (everything after and including the dot+city, e.g. ".FORTALEZA", ".CAPITAL", ".SAO PAULO"). Apply lowercase and trim. Examples:
   - "ALIMENTAÇÃO .FORTALEZA" → "alimentação"
   - "VEÍCULOS .CAPITAL" → "veículos"
   - "DIVERSOS .SAO PAULO" → "diversos"

3. **Dates and year inference**: Transaction dates appear as DD/MM. Infer the year from the document's "Postagem" date:
   - If the transaction month <= postagem month → year = postagem year
   - If the transaction month > postagem month → year = postagem year - 1
   This handles back-dated installments correctly.

4. **Installments**: Detect installment suffixes in descriptions (e.g. "SAMSUNG NO ITAU 10/21" means installment 10 of 21).
   - Set installmentNumber = 10, installmentTotal = 21
   - Strip the installment suffix from the description (e.g. "SAMSUNG NO ITAU")
   - Do NOT set groupId — post-processing will compute it deterministically.

5. **International purchases** (section "Lançamentos internacionais"):
   - Use the BRL value (not USD) as the amount
   - Store USD amount and conversion rate in meta: { "usd": number, "brl": number }
   - IOF repasse ("Repasse de IOF em R$" or similar) → emit as a SEPARATE transaction with:
     - description: "IOF — Repasse internacional"
     - category: "fees"
     - type: "EXP"
     - Use the due date as the transaction date

6. **Future installments**: Transactions in the "Compras parceladas - próximas faturas" section go into "futureInstallments" array, NOT "extractedTransactions". Each needs: date, description (without installment suffix), amount, source, installmentNumber, installmentTotal.

7. **Total and due date**:
   - Extract totalAmount from "Total desta fatura" (the BRL number)
   - Extract dueDate from "Vencimento: DD/MM/YYYY" → convert to YYYY-MM-DD

8. **Amount and type**: All credit card charges are type = "EXP" with positive amount. Negative values (credits/refunds) are type = "INC" with amount = Math.abs(value).

9. **Ordering**: Return transactions in chronological order (date ascending), preserving document order for same-date entries.

## Exclusion rules — do NOT include these lines:
- "Total desta fatura" (summary line — extract the number for totalAmount but don't create a transaction)
- "Total da fatura anterior"
- "Pagamento efetuado em DD/MM/YYYY -R$ X" (payment of PREVIOUS bill — not a current transaction)
- "Saldo financiado"
- Card-level subtotals: "Lançamentos no cartão (final NNNN) <total>"
- International subtotals: "Total transações inter. em R$", "Total lançamentos inter."
- "Total dos lançamentos"
- "SALDO ANTERIOR", "SALDO TOTAL DISPONÍVEL DIA"
- Any balance line, summary line, header, footer, page number, or disclaimer
- "Próxima fatura", "Demais faturas", "Total para próximas faturas" (summary lines in future section)`;
}

// ── Post-processing ────────────────────────────────────────────────────────────

function computeInstallmentGroupId(
  normalisedDescription: string,
  firstKnownCardDate: string,
): string {
  return uuidv5(
    `${normalisedDescription}|${firstKnownCardDate}`,
    NAMESPACE_INSTALLMENT,
  );
}

export function validateAndPostProcess(raw: unknown): ParseResult {
  const parsed = ParseResultSchema.parse(raw);

  // Track first known date per source for groupId computation
  const firstDateBySource: Record<string, string> = {};

  // First pass: collect first dates per source
  for (const tx of parsed.extractedTransactions) {
    const normSource = tx.source.trim().toLowerCase();
    if (!firstDateBySource[normSource]) {
      firstDateBySource[normSource] = tx.date;
    }
  }

  // Post-process extracted transactions
  parsed.extractedTransactions = parsed.extractedTransactions.map((tx, _index) => {
    const normSource = tx.source.trim().toLowerCase();
    const normCategory = tx.category.trim().toLowerCase();
    const amount = Math.abs(tx.amount);

    // Compute groupId for installment rows
    let groupId = tx.groupId;
    if (tx.installmentNumber && tx.installmentTotal && !groupId) {
      const normDesc = tx.description.trim().toLowerCase();
      const firstDate = firstDateBySource[normSource] ?? tx.date;
      groupId = computeInstallmentGroupId(normDesc, firstDate);
    }

    return {
      ...tx,
      source: normSource,
      category: normCategory,
      amount,
      groupId,
    };
  });

  // Deterministic ordering: date ascending, preserve document order for same date
  // (stable sort — Array.prototype.sort is stable in modern JS engines)
  parsed.extractedTransactions.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });

  // Normalise future installments
  if (parsed.futureInstallments) {
    parsed.futureInstallments = parsed.futureInstallments.map((fi) => ({
      ...fi,
      source: fi.source.trim().toLowerCase(),
      amount: Math.abs(fi.amount),
    }));
  }

  return parsed;
}

// ── Conservation check ─────────────────────────────────────────────────────────

export function checkConservation(
  extractedTransactions: ExtractedTransaction[],
  totalAmount: number | undefined,
): void {
  if (totalAmount === undefined) return;

  const sum = extractedTransactions.reduce(
    (acc, t) => acc + (t.type === 'EXP' ? t.amount : -t.amount),
    0,
  );

  if (Math.abs(sum - totalAmount) >= 0.01) {
    throw new Error(
      `Conservation check failed: sum of transactions (${sum.toFixed(2)}) does not match totalAmount (${totalAmount.toFixed(2)})`,
    );
  }
}

// ── Retry helpers ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableHttpError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 429 || (status >= 500 && status < 600);
  }
  return false;
}

// ── Core LLM call ──────────────────────────────────────────────────────────────

async function callAnthropicWithRetry(
  client: Anthropic,
  systemPrompt: string,
  pdfBase64: string,
  userText: string,
): Promise<Anthropic.Message> {
  const maxRetries = 2;
  const baseDelayMs = 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        temperature: 0,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                },
              },
              {
                type: 'text',
                text: userText,
              },
            ],
          },
        ],
      });

      return response;
    } catch (error) {
      if (isRetryableHttpError(error) && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(
          JSON.stringify({
            level: 'WARN',
            message: 'Anthropic API retryable error, retrying',
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error('Exhausted retries for Anthropic API call');
}

function extractJsonFromResponse(response: Anthropic.Message): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in Anthropic response');
  }

  let text = textBlock.text.trim();

  // Strip markdown code fences if present
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  return text;
}

// ── Factory function ───────────────────────────────────────────────────────────

export function llmParser(bank: BankId, documentType: DocumentType): Parser {
  return {
    async parse(bytes: Uint8Array): Promise<ParseResult> {
      const apiKey = await getAnthropicApiKey();
      const client = new Anthropic({ apiKey });

      const pdfBase64 = Buffer.from(bytes).toString('base64');
      const systemPrompt = buildSystemPrompt(bank, documentType);
      const userText =
        'Extract all transactions from this document following the instructions in the system prompt. Return only the JSON object.';

      // First attempt
      const response = await callAnthropicWithRetry(
        client,
        systemPrompt,
        pdfBase64,
        userText,
      );

      // Log token usage
      console.log(
        JSON.stringify({
          level: 'INFO',
          message: 'Anthropic API token usage',
          bank,
          documentType,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        }),
      );

      const jsonText = extractJsonFromResponse(response);
      let rawParsed: unknown;
      try {
        rawParsed = JSON.parse(jsonText);
      } catch {
        throw new Error(
          `Failed to parse JSON from Anthropic response: ${jsonText.slice(0, 200)}`,
        );
      }

      // Zod validation — retry once on failure with explicit error details
      let result: ParseResult;
      try {
        result = validateAndPostProcess(rawParsed);
      } catch (validationError) {
        console.log(
          JSON.stringify({
            level: 'WARN',
            message: 'Zod validation failed on first attempt, retrying with error details',
            error:
              validationError instanceof Error
                ? validationError.message
                : String(validationError),
          }),
        );

        const retryUserText = `The previous response failed validation with the following error:

${validationError instanceof Error ? validationError.message : String(validationError)}

Please fix the issues and return a valid JSON object following the exact schema from the system prompt. Return only the JSON object.`;

        const retryResponse = await callAnthropicWithRetry(
          client,
          systemPrompt,
          pdfBase64,
          retryUserText,
        );

        // Log retry token usage
        console.log(
          JSON.stringify({
            level: 'INFO',
            message: 'Anthropic API token usage (validation retry)',
            bank,
            documentType,
            input_tokens: retryResponse.usage.input_tokens,
            output_tokens: retryResponse.usage.output_tokens,
          }),
        );

        const retryJsonText = extractJsonFromResponse(retryResponse);
        let retryRawParsed: unknown;
        try {
          retryRawParsed = JSON.parse(retryJsonText);
        } catch {
          throw new Error(
            `Failed to parse JSON from Anthropic retry response: ${retryJsonText.slice(0, 200)}`,
          );
        }

        // If this also fails, let it throw
        result = validateAndPostProcess(retryRawParsed);
      }

      // Conservation check for credit card bills
      checkConservation(result.extractedTransactions, result.totalAmount);

      return result;
    },
  };
}
