# Implementation Plan — Statement Import & Reconciliation

## Overview

This plan implements the Statement Import & Reconciliation feature using an **LLM-based extraction approach**. Instead of per-bank regex parsers, a single `llm-parser.ts` module sends uploaded PDFs to the Anthropic Messages API (Claude) as base64-encoded document content blocks and receives structured `ExtractedTransaction[]` JSON back. The response is validated with Zod, post-processed for ordering and normalisation, and stored on the Statement record for user review before import.

The implementation is split into 7 phases: data layer, parser library, backend lambdas, CDK wiring, frontend, property tests, and test utilities. TypeScript is used throughout, matching the existing codebase.

## Tasks

- [x] 1. Phase 1 — Data layer (infra changes only)
  - [x] 1.1 Create `laskifin-Statements` DynamoDB table in `infra/lib/data-stack.ts`
    - pk/sk string, PAY_PER_REQUEST, PITR on, `deletionProtection: true`, `removalPolicy: RETAIN`
    - GSI `GSI_StatementsByS3Key` — pk = `s3Key`, projection ALL
    - GSI `GSI_StatementsByDocumentTypeDueDate` — pk = `pk`, sk = `documentTypeDueDate`, projection ALL
    - Export `statementsTableName` and `statementsTableArn` via `CfnOutput` matching existing naming style
    - _Requirements: 9.9_

  - [x] 1.2 Add sparse GSI `GSI_LedgerByImportHash` on the existing `ledgerTable`
    - pk = `pk`, sk = `importHash`, projection KEYS_ONLY
    - Sparse is automatic — items without `importHash` are not indexed
    - _Requirements: 9.10_

  - [x] 1.3 Add infra assertion test `infra/test/statements-data-stack.test.ts`
    - Assert `laskifin-Statements` table exists with both GSIs
    - Assert `GSI_LedgerByImportHash` exists on the Ledger table with `Projection: { ProjectionType: 'KEYS_ONLY' }`
    - Assert resource count for DynamoDB tables matches expected
    - _Requirements: 9.11_

- [x] 2. Phase 2 — Parser library (LLM-based extraction)
  - [x] 2.1 Add `@anthropic-ai/sdk` and `@aws-sdk/client-secrets-manager` to `back/lambdas/package.json`
    - `@anthropic-ai/sdk`: `0.39.0` (exact version)
    - `@aws-sdk/client-secrets-manager`: `3.470.0` (exact version, matches existing `@aws-sdk` packages)
    - Remove `pdfjs-dist` dependency (no longer needed)
    - Run `npm ci` from repo root
    - _Requirements: 11.2_

  - [x] 2.2 Create `parsers/types.ts`
    - Export `ExtractedTransaction`, `ExtractedInstallmentPreview`, `ParseResult`, `Parser`, `BankId`, `DocumentType`
    - Verbatim from design doc §"Parser Strategy"
    - _Requirements: 2.3, 2.4, 3.1, 4.1_

  - [x] 2.3 Create `parsers/llm-parser.ts` — the single LLM parser implementation
    - Secrets Manager retrieval with cold-start caching for the Anthropic API key (`ANTHROPIC_SECRET_NAME` env var)
    - Anthropic Messages API call with base64 `document` content block, model `claude-sonnet-4-6`, `temperature: 0`, `max_tokens: 16384`
    - `buildSystemPrompt(bank, documentType)` function with extraction rules for BANK_ACCOUNT and CREDIT_CARD
    - Zod validation of LLM response against `ParseResult` schema
    - Retry logic: on Zod validation failure, retry once with explicit error details in prompt; on 5xx/429, retry up to 2 times with exponential backoff (1s, 2s)
    - Post-processing: deterministic ordering by (date asc, order-in-document), source/category normalisation (`.trim().toLowerCase()`), `groupId` computation via `uuidv5(normalisedDescription + firstKnownCardDate, NAMESPACE_INSTALLMENT)` for installment rows, ensure `amount = Math.abs(value)`
    - Conservation check for credit card bills: `Math.abs(sum(extractedTransactions.amount) - totalAmount) < 0.01`, throw if fails
    - Token usage logging (`input_tokens`, `output_tokens`) via structured console.log
    - _Requirements: 3.1–3.8, 4.1–4.10, 11.1–11.7_

  - [x] 2.4 Create `parsers/index.ts` — registry that routes all (bank, documentType) to LLM parser
    - `getParser(bank: BankId, documentType: DocumentType): Parser` — returns `llmParser(bank, documentType)` for all combinations
    - Preserves the `getParser` function signature so `process-statement.ts` calling code does not change
    - Re-export types from `types.ts`
    - _Requirements: 2.3_

  - [x] 2.5 Unit tests for `llm-parser.ts` in `back/lambdas/test/statements/parsers/llm-parser.test.ts`
    - Mock Anthropic API responses (pre-recorded JSON fixtures)
    - Test Zod schema validation of well-formed and malformed responses
    - Test retry on validation failure (first call returns invalid JSON, second returns valid)
    - Test post-processing: deterministic ordering, source/category normalisation, groupId computation
    - Test conservation check: passes when sum matches totalAmount, throws when it doesn't
    - Test token usage logging is called with correct values
    - _Requirements: 3.3, 4.9, 11.3, 11.4, 11.5_

  - [x] 2.6 Integration tests for `llm-parser.ts` in `back/lambdas/test/statements/parsers/llm-parser.integration.test.ts`
    - Real Anthropic API calls with fixture PDFs from `.claude/specs/statement-import/fixtures/`
    - Gated behind `ANTHROPIC_API_KEY` env var — not run in CI by default
    - Bank account fixture: canonical rows from Requirement 3 AC 8 are extracted, no `SALDO*` rows
    - Credit card fixture: per-card aggregates match (7077.99 / 379.00 / 1603.47 / 116.96 / 4.07 / sum = 9181.49)
    - Installment suffix parsing, international IOF extraction, future-installment separation
    - _Requirements: 3.8, 4.9_

- [x] 3. Checkpoint — Ensure parser library tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 3 — Backend Lambdas
  - [x] 4.1 Create `init-statement-upload.ts` (`POST /statements`)
    - Zod schema: `{ filename, contentType, documentType, bank }` per design doc
    - HTTP 400 on invalid body, 401 if no sub
    - Generate `statementId` (uuid v4), `s3Key = statements/<sub>/<statementId>.<ext>`
    - `PutCommand` to `laskifin-Statements` with `status: 'pending'`, `createdAt/updatedAt = now`, `errors: []`
    - Pre-signed PUT URL via `@aws-sdk/s3-request-presigner`, expiry 600 s
    - Response 202 with `{ statementId, uploadUrl, expiresAt }`
    - _Requirements: 1.1–1.8_

  - [x] 4.2 Create `services/import-hash.ts`
    - `buildImportHash(userId, { source, date, amount, description }): string` — sha256 hex
    - Pure function, no AWS dependencies
    - _Requirements: 7.3_

  - [x] 4.3 Create `services/reconciliation.ts`
    - `reconcile(stmt, parsed): Promise<ReconciliationCandidate[]>`
    - CREDIT_CARD path: query Ledger for `pk = USER#sub`, `sk begins_with TRANS#YYYY-MM#EXP#` across 3-day window; filter by `amount === totalAmount` AND description matches Itaú bill-payment regex
    - BANK_ACCOUNT path: filter extracted rows for bill-payment pattern + `EXP`; query `GSI_StatementsByDocumentTypeDueDate` for matching credit card statements
    - Return `high` (1 match), `ambiguous` (≥2), `none` (0)
    - `candidateId = sha256(parentSk + childStatementId).slice(0, 16)` for stable referencing
    - _Requirements: 5.1–5.7_

  - [x] 4.4 Create `process-statement.ts` (S3 trigger, not API Gateway)
    - Handler signature `(event: S3Event) => Promise<void>`
    - Resolve Statement via `GSI_StatementsByS3Key`; transition status → `processing`
    - `GetObject` from S3; call `getParser(bank, documentType).parse(bytes)` — routes to LLM parser
    - Call `reconcile()` to produce `ReconciliationCandidate[]`
    - Single `UpdateCommand` to persist `extractedTransactions`, `futureInstallments`, `totalAmount`, `dueDate`, `documentTypeDueDate`, `reconciliationCandidates`, `status: 'done'`
    - On throw: `status: 'failed'`, `errors: [...]`, do not rethrow
    - Never touches Ledger or Links (per BR-S30 / Requirement 2.8)
    - _Requirements: 2.1–2.8_

  - [x] 4.5 Create `review-statement.ts` (`GET /statements/{statementId}`)
    - `GetCommand` for the Statement record — HTTP 404 if missing
    - Compute `importHash` for each draft row; batch-query `GSI_LedgerByImportHash`; build `duplicates: { index, matchedLedgerSk }[]`
    - Return full statement record plus `duplicates`
    - _Requirements: 6.1–6.6_

  - [x] 4.6 Create `list-statements.ts` (`GET /statements`)
    - `QueryCommand` with `pk = USER#sub`, `sk begins_with STATEMENT#`, `ScanIndexForward: false`
    - Project-out `extractedTransactions` — list view returns metadata only
    - _Requirements: 9.1_

  - [x] 4.7 Create `confirm-statement-import.ts` (`POST /statements/{statementId}/confirm`)
    - Body: `{ selectedIndices: number[], acceptedReconciliationIds: string[], reconciliationChoices?: Record<candidateId, parentSk> }`
    - Validate bounds, HTTP 400 on empty selection or out-of-range index
    - Duplicate filter: compute hash for each selected row, `GSI_LedgerByImportHash` lookup, split into `toWrite` + `skipped[]`
    - `BatchWriteCommand` in chunks of 25 with up to 3 exponential-backoff retries on `UnprocessedItems`
    - For each new item: build SK via `TRANS#YYYY-MM#TYPE#uuid`, apply `.trim().toLowerCase()` to `category` and `source`, write `categoryMonth`, `importHash`, `sourceStatementId`, `groupId`, `installmentNumber`, `installmentTotal`
    - Call `updateMonthlySummary()` per written row
    - For each accepted reconciliation candidate: iterate new Ledger SKs, issue `PutCommand` to `laskifin-Links` with deterministic `sk = buildLinkSk(parentSk, childSk)`, `ConditionExpression: 'attribute_not_exists(pk)'`
    - Final `UpdateCommand` on Statement: `status: 'imported'`, `importedCount`, `REMOVE extractedTransactions`
    - Response 200: `{ imported, skipped, linked, linkFailed }`
    - _Requirements: 7.1–7.9_

  - [x] 4.8 Create `delete-statement.ts` (`DELETE /statements/{statementId}`)
    - HTTP 409 if `status === 'processing'`
    - `DeleteObjectCommand` on the S3 key, `DeleteCommand` on the DDB item
    - Never touches Ledger or Links (BR-S8)
    - _Requirements: 8.1–8.4_

  - [x] 4.9 Unit tests for every handler in `back/lambdas/test/statements/`
    - Mock AWS SDK with `aws-sdk-client-mock` (already used by existing handler tests)
    - Mock Anthropic API responses for `process-statement.ts` tests (not pdfjs-dist)
    - Test init-statement-upload: pre-signed URL shape, DDB write, validation errors
    - Test process-statement: LLM parser invocation, reconciliation, status transitions, error handling
    - Test review-statement: duplicate detection, 404 for missing/cross-user
    - Test confirm-statement-import: dedup by importHash, MonthlySummary side effects, link creation, partial failure
    - Test delete-statement: 409 on processing, S3 + DDB cleanup
    - _Requirements: 1.1–1.8, 2.1–2.8, 6.1–6.6, 7.1–7.9, 8.1–8.4_

- [x] 5. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Phase 4 — CDK wiring (ApiStack)
  - [x] 6.1 Accept new props in `infra/lib/api-stack.ts`: `statementsTable`, `statementsTableName`, `statementsTableArn`
    - _Requirements: 9.1_

  - [x] 6.2 Create `laskifin-statements` S3 bucket
    - `blockPublicAccess: BLOCK_ALL`, versioning, lifecycle `glacier after 90 days`, CORS allowing PUT from `frontendOrigin`, S3-managed encryption
    - _Requirements: 9.5_

  - [x] 6.3 Create six `NodejsFunction` Lambdas using the existing helper pattern
    - `init-statement-upload` — 256 MB / 10 s
    - `process-statement` — 512 MB / **90 s** (increased for LLM API latency), standard CJS bundling (no ESM workaround needed — `@anthropic-ai/sdk` works with CJS unlike `pdfjs-dist`)
    - `review-statement` — 256 MB / 10 s
    - `confirm-statement-import` — 512 MB / 30 s
    - `list-statements` — 256 MB / 10 s
    - `delete-statement` — 256 MB / 10 s
    - _Requirements: 9.3, 9.4_

  - [x] 6.4 Set environment variables and IAM grants per handler
    - Process_Statement_Handler: add `ANTHROPIC_SECRET_NAME = 'laski/anthropic-api-key'` env var; add `secretsmanager:GetSecretValue` IAM grant via `anthropicSecret.grantRead(processStatementHandler)` using `Secret.fromSecretNameV2`
    - All other handlers: env vars per Requirement 9.8
    - IAM grants per Requirement 9.7 — use `grantReadData`/`grantWriteData`/`grantReadWriteData`; never wildcard
    - _Requirements: 9.7, 9.8, 11.1_

  - [x] 6.5 Wire S3 event notification
    - `statementsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(processStatementHandler), { prefix: 'statements/' })`
    - API Gateway is NOT wired to `process-statement`
    - _Requirements: 9.6_

  - [x] 6.6 Add API routes using the existing `cognitoMethod(resource, method, handler, authorizer)` helper
    - `POST /statements` → `init-statement-upload`
    - `GET /statements` → `list-statements`
    - `GET /statements/{statementId}` → `review-statement`
    - `POST /statements/{statementId}/confirm` → `confirm-statement-import`
    - `DELETE /statements/{statementId}` → `delete-statement`
    - _Requirements: 9.1, 9.2_

  - [x] 6.7 CDK assertion test `infra/test/statements-api-stack.test.ts`
    - All five routes exist with correct method + Cognito authorizer
    - Each Lambda has correct memory/timeout/runtime (Node 22.x); process-statement has **90 s** timeout
    - Env vars are set per handler per Requirement 9.8; `ANTHROPIC_SECRET_NAME` is set on process-statement
    - Secrets Manager read grant exists on process-statement
    - S3 bucket has BlockPublicAccess.ALL, versioning, lifecycle rule
    - S3 event notification wired to `process-statement` with prefix `statements/`
    - IAM grants match Requirement 9.7 (use `Match.objectLike` on IAM policy docs)
    - _Requirements: 9.11_

- [x] 7. Checkpoint — Ensure CDK synth and infra tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Phase 5 — Frontend
  - [x] 8.1 Create `front/src/api/statements.ts`
    - Types + functions mirroring the five endpoints
    - File upload via separate `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })` — not wrapped with auth
    - _Requirements: 10.1_

  - [x] 8.2 Create `StatementImportPage.tsx` — two-step form
    - Step 1: `documentType` + `bank` select
    - Step 2: file drop + upload progress + polling (every 2 s, max 60 s)
    - On `status === 'done'`: render `<ReviewTable>` + `<ReconciliationBanner>`
    - On `status === 'failed'`: inline error with first `errors[]` message + retry
    - On success: POST confirm → toast with per-row results → navigate to `/transactions`
    - _Requirements: 10.2–10.8_

  - [x] 8.3 Add route `/statements/import` in `routes.tsx` inside `<ProtectedRoute>`, plus nav link
    - _Requirements: 10.1_

  - [x] 8.4 Create `ReviewTable.tsx`
    - Checkbox per row, default checked except rows flagged in `duplicates[]`
    - Editable `category` / `source` cells (Chakra UI `Editable`)
    - Summary footer: selected count + sum
    - Section divider between main transactions and `futureInstallments` (read-only informational rows)
    - _Requirements: 10.4_

  - [x] 8.5 Create `ReconciliationBanner.tsx`
    - `high`: "We detected this bill was paid from your Itaú checking account on DD/MM/YYYY for R$ X. Link all N charges to the bank payment?" + single Accept button
    - `ambiguous`: shows `candidateParents[]` in a radio list, Accept enabled after selection
    - `none`: informational "no corresponding bank payment found" with "upload checking account statement" link
    - _Requirements: 10.5_

  - [x] 8.6 Frontend unit tests (Vitest + RTL) for `ReviewTable` and `ReconciliationBanner`
    - In `front/src/components/__tests__/`
    - No new frontend property tests required — backend owns the correctness properties
    - _Requirements: 10.4, 10.5_

- [x] 9. Checkpoint — Ensure frontend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Phase 6 — Property-based tests (P-SI-1 … P-SI-6)
  - All in `back/lambdas/test/statements/properties/`, one file per property, `numRuns: 100`, tag comment `// Feature: statement-import, Property <N>: ...`

  - [x] 10.1 `p-si-1-conservation.test.ts`
    - **Property 1: Conservation of amount**
    - Generate synthetic `ParseResult` objects with known `totalAmount` and `extractedTransactions`
    - Assert `Math.abs(sum(extractedTransactions.amount) - totalAmount) < 0.01`
    - Tests the conservation check logic independent of the LLM call
    - **Validates: Requirements 4.9, BR-S9**

  - [x] 10.2 `p-si-2-no-balance-rows.test.ts`
    - **Property 2: No balance rows**
    - Generate synthetic `ExtractedTransaction[]` arrays including balance-line descriptions
    - Assert the post-extraction validation filter rejects balance-line descriptions (`SALDO ANTERIOR`, `SALDO TOTAL DISPONÍVEL DIA`)
    - Tests validation logic against synthetic data, not LLM output
    - **Validates: Requirements 3.2, BR-S10**

  - [x] 10.3 `p-si-3-import-idempotency.test.ts`
    - **Property 3: Import idempotency**
    - Unit-test `confirmImport` twice in a row
    - Assert the second run returns 0 imported, N skipped
    - **Validates: Requirements 7.3, BR-S19**

  - [x] 10.4 `p-si-4-reconciliation-exactness.test.ts`
    - **Property 4: Reconciliation exactness**
    - Synthetic `(bankStmt, cardStmt)` pairs where exactly one row matches bill-payment pattern + amount + window
    - Assert exactly one `high` candidate
    - **Validates: Requirements 5.1–5.3, BR-S22–S23**

  - [x] 10.5 `p-si-5-link-count.test.ts`
    - **Property 5: Link count**
    - After accepted reconciliation with `childCount = N`, Links table gains exactly N items
    - Second run gains 0 (idempotent)
    - **Validates: Requirements 7.6, BR-S27**

  - [x] 10.6 `p-si-6-user-isolation.test.ts`
    - **Property 6: User isolation**
    - U1 uploads, U2 calls each of the five endpoints — all return 404 (not 403)
    - **Validates: Requirements 6.3, BR-S7**

- [x] 11. Phase 7 — Arbitraries & shared test utilities
  - [x] 11.1 Update `back/lambdas/test/statements/properties/arbitraries.ts`
    - Keep `fc.record` generators for `ExtractedTransaction` (used by P-SI-1..6)
    - Keep `fc.record` generators for `ParseResult` with synthetic `totalAmount` and `extractedTransactions`
    - Remove synthetic Itaú bank-account row string generators (no longer needed — regex parsers removed)
    - Remove synthetic Itaú card-bill row string generators (no longer needed — regex parsers removed)
    - _Requirements: P-SI-1 through P-SI-6_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties against synthetic data (not LLM output)
- Unit tests validate specific examples and edge cases
- The LLM parser replaces all per-bank regex parsers — `pdf-text.ts`, `itau-bank-account.ts`, and `itau-credit-card.ts` are removed
- `pdfjs-dist` dependency is removed; replaced by `@anthropic-ai/sdk` and `@aws-sdk/client-secrets-manager`
- Process-statement Lambda timeout is 90 s (up from 60 s) to accommodate LLM API latency
- ESM bundling workaround (format: ESM, banner with createRequire) is removed — `@anthropic-ai/sdk` works with standard CJS bundling
