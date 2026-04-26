# Implementation Plan — Statement Import & Reconciliation

> Companion to `statement-import-requirements.md` and `statement-import-design.md`. Those are the source of truth for *what* and *why*; this file is the source of truth for *how* and *in what order*.

---

## Context

Phase 3 of the roadmap in `project-overview.md`. Transaction CRUD (Phase 1) is deployed; the Linking Layer (Phase 2) is specced and implemented on branch `fix/linking-layer`. Statement Import depends on both and reuses:

- `laskifin-Ledger` — writes imported entries with new `importHash` + `sourceStatementId` attributes.
- `laskifin-MonthlySummary` + shared `updateMonthlySummary()` — updated on every import-time Ledger write.
- `laskifin-Links` + `buildLinkSk` / `buildLinkId` from `back/lambdas/src/links/link-utils.ts` — reused by the reconciliation confirmation path to wire up parent/child links without a new link model.

Goal: let the user upload an Itaú checking-account statement and an Itaú Mastercard Black bill, have the system extract ~30 + ~100 transactions, detect the `ITAU BLACK 3102-2305 -9.181,49` checking-account debit as the settlement of the R$ 9.181,49 credit-card bill, and on one click write every entry to the Ledger plus all ~100 parent→child Links.

The canonical fixture is the pair `extrato-lancamentos_conta.pdf` + `extrato-lancamentos_cartao.pdf` described in the requirements doc (not yet committed to the repo — see Task 0.1).

---

## Architectural approach

Three pillars, taken directly from the design doc and already validated there:

1. **Async extract pipeline** — API returns 202 with a pre-signed S3 PUT URL; S3 `ObjectCreated` event fires `process-statement`; frontend polls `GET /statements/{id}` until `status === 'done'`.
2. **Draft → confirm workflow** — Extracted rows live on the Statement record (`extractedTransactions` list). Nothing lands in the Ledger until `POST /statements/{id}/confirm`.
3. **Reconciliation as proposal** — Parent = checking-account debit (Bill_Payment_Entry), children = individual card charges. The reconciler produces `ReconciliationCandidate[]` on the Statement record; Links are only written when the user accepts on confirm.

### LLM-based extraction (replaces regex parsers)

Transaction extraction is performed by sending the uploaded PDF directly to the **Anthropic Messages API** (Claude) as a base64-encoded `document` content block. Claude's native PDF support processes each page as text + image, making it robust against complex layouts (two-column credit card bills, varying bank formats) without per-bank regex parsers. The LLM is instructed via a structured system prompt to return transactions in the existing `ExtractedTransaction` JSON schema, and the response is validated with Zod.

This approach is **bank-agnostic** — the same prompt works for any bank's PDF. The `bank` field on the Statement record becomes informational context passed to the prompt rather than a parser selector.

Parent = debit, child = charges — matches the Linking Layer's existing "this pays for those" semantics, so the `LinkWidget` works without modification.

---

## Prerequisites

### Sample fixtures

- **Task 0.1** — Commit the two sample PDFs (`extrato-lancamentos_conta.pdf`, `extrato-lancamentos_cartao.pdf`) to `.claude/specs/statement-import/fixtures/`. They are referenced by `statement-import-requirements.md` §BR-S and by the property/unit tests (Phase 6). Without them, the integration tests cannot run.

### Dependencies (exact versions, per `coding-standards.md`)

Add to `back/lambdas/package.json`:

- `@aws-sdk/client-s3`: `3.470.0` (match existing `@aws-sdk/lib-dynamodb`)
- `@aws-sdk/s3-request-presigner`: `3.470.0`
- `@anthropic-ai/sdk`: `0.39.0` (Anthropic Messages API client for LLM-based PDF extraction)
- `@aws-sdk/client-secrets-manager`: `3.470.0` (retrieve Anthropic API key at runtime)

Remove from `back/lambdas/package.json`:

- ~~`pdfjs-dist`: `4.10.38`~~ — No longer needed. The LLM processes the raw PDF directly via its native document support.

Add to `front/package.json`:

- nothing new — file upload via `fetch(url, { method: 'PUT', body: file })` uses existing fetch client; polling uses existing pattern in `api/client.ts`.

---

## Critical files

### New files

```
back/lambdas/src/statements/
├── init-statement-upload.ts
├── process-statement.ts
├── review-statement.ts
├── confirm-statement-import.ts
├── list-statements.ts
├── delete-statement.ts
├── parsers/
│   ├── index.ts                  # registry: getParser(bank, documentType) → llm-parser
│   ├── llm-parser.ts             # LLM-based extraction via Anthropic Messages API
│   └── types.ts                  # ExtractedTransaction, ParseResult, Parser
├── services/
│   ├── reconciliation.ts
│   └── import-hash.ts            # sha256(userId + source + date + amount + description)
└── shared/
    └── statement-io.ts           # getStatement, transitionStatus, batchQueryByImportHash

front/src/pages/StatementImportPage.tsx
front/src/components/statements/
├── UploadStep.tsx
├── ReviewTable.tsx
└── ReconciliationBanner.tsx
front/src/api/statements.ts
```

### Modified files

- `infra/lib/data-stack.ts` — add `StatementsTable`, add sparse `GSI_LedgerByImportHash`, export names/ARNs via `CfnOutput`.
- `infra/lib/api-stack.ts` — add S3 bucket `laskifin-statements`, six Lambda definitions (process-statement with 90 s timeout, `ANTHROPIC_SECRET_NAME` env var, Secrets Manager grant, standard CJS bundling — no ESM workaround), five API routes under `/statements`, Cognito authorizer, IAM grants, S3 event notification.
- `infra/bin/infra.ts` — pass new props between stacks, preserve deploy order (`AuthStack → DataStack → ApiStack → FrontendStack`).
- `front/src/router/routes.tsx` — add `/statements/import` route behind `ProtectedRoute`.
- Navigation component (wherever the main nav lives) — add "Import statement" link.
- `back/lambdas/package.json` — add `@anthropic-ai/sdk` and `@aws-sdk/client-secrets-manager`; remove `pdfjs-dist`.

### Removed files (from previous regex-parser design)

- ~~`parsers/pdf-text.ts`~~ — pdfjs-dist adapter, no longer needed.
- ~~`parsers/itau-bank-account.ts`~~ — Itaú bank account regex parser, replaced by LLM parser.
- ~~`parsers/itau-credit-card.ts`~~ — Itaú credit card regex parser, replaced by LLM parser.

### Reused files (do not modify)

- `back/lambdas/src/shared/utils.ts` — `withAuth`, `docClient`, `errorResponse`, `successResponse`, `parseJsonBody`, `decodeSk`.
- `back/lambdas/src/shared/update-monthly-summary.ts` — call once per imported Ledger row.
- `back/lambdas/src/links/link-utils.ts` — `buildLinkSk`, `buildLinkId`.
- `front/src/api/client.ts` — `getAuthToken`, `handleResponse`, `API_BASE_URL`.

---

## Task breakdown

### Phase 1 — Data layer (infra changes only)

- **Task 1.1** — In `infra/lib/data-stack.ts`, create `laskifin-Statements` DynamoDB table (pk/sk string, PAY_PER_REQUEST, PITR on, `deletionProtection: true`, `removalPolicy: RETAIN`) with two GSIs:
  - `GSI_StatementsByS3Key` — pk = `s3Key`, projection ALL.
  - `GSI_StatementsByDocumentTypeDueDate` — pk = `pk`, sk = `documentTypeDueDate`, projection ALL.

  Export `statementsTableName` and `statementsTableArn` via `CfnOutput` matching the naming style used for `ledgerTableName` / `linksTableName`.

- **Task 1.2** — In the same file, add sparse GSI `GSI_LedgerByImportHash` on the existing `ledgerTable` — pk = `pk`, sk = `importHash`, projection `KEYS_ONLY`. Sparse is automatic because items without `importHash` are not indexed.

- **Task 1.3** — Add infra assertion test `infra/test/statements-data-stack.test.ts`:
  - `Template.resourceCountIs('AWS::DynamoDB::Table', <expected>)`.
  - `Template.hasResourceProperties('AWS::DynamoDB::Table', { TableName: 'laskifin-Statements', ... })` including both GSIs.
  - Assert `GSI_LedgerByImportHash` exists on the Ledger table with `Projection: { ProjectionType: 'KEYS_ONLY' }`.

### Phase 2 — Parser library (LLM-based extraction)

- **Task 2.1** — Update `back/lambdas/package.json`:
  - Add `@anthropic-ai/sdk`: `0.39.0` (exact version).
  - Add `@aws-sdk/client-secrets-manager`: `3.470.0` (exact version, matches existing `@aws-sdk` packages).
  - Remove `pdfjs-dist`: `4.10.38` (no longer needed — LLM processes raw PDF directly).
  - Run `npm ci` from repo root.

- **Task 2.2** — `parsers/types.ts`: export `ExtractedTransaction`, `ExtractedInstallmentPreview`, `ParseResult`, `Parser`, `BankId`, `DocumentType` — verbatim from the design doc §"Parser Strategy".

- **Task 2.3** — `parsers/llm-parser.ts`: the single LLM parser implementation:
  - **Secrets Manager retrieval** with cold-start caching for the Anthropic API key. The secret name is passed via the `ANTHROPIC_SECRET_NAME` environment variable. Cache at module scope for the lifetime of the warm Lambda container.
  - **Anthropic Messages API call** with base64 `document` content block using `@anthropic-ai/sdk`. Model `claude-sonnet-4-6`, `temperature: 0`, `max_tokens: 16384`.
  - **System prompt construction** via `buildSystemPrompt(bank, documentType)` function. Includes extraction rules for BANK_ACCOUNT (source from header, negative → EXP, positive → INC, category = uncategorized, DD/MM/YYYY → ISO) and CREDIT_CARD (plastic-card sections, year inference from posting date, installment suffix detection, category from line below, international BRL + IOF, future-installments separation, totalAmount + dueDate extraction). Includes explicit exclusion rules for balance/summary lines.
  - **Zod validation** of LLM response against `ParseResult` schema. On validation failure, retry once with explicit error details in prompt. On 5xx/429, retry up to 2 times with exponential backoff (1s, 2s). Client-side 4xx (other than 429) not retried.
  - **Post-processing**: deterministic ordering by (date ascending, order-in-document), source/category normalisation (`.trim().toLowerCase()`), `groupId` computation via `uuidv5(normalisedDescription + firstKnownCardDate, NAMESPACE_INSTALLMENT)` for installment rows, ensure `amount = Math.abs(value)`.
  - **Conservation check** for credit card bills: `Math.abs(sum(extractedTransactions.amount) - totalAmount) < 0.01`, throw if fails.
  - **Token usage logging**: log `input_tokens` and `output_tokens` from response `usage` field via structured `console.log`.

- **Task 2.4** — `parsers/index.ts`: `getParser(bank, documentType): Parser`. Routes all `(bank, documentType)` combinations to the LLM parser. The `getParser` function signature is preserved so `process-statement.ts` calling code does not change. Re-exports types from `types.ts`.

- **Task 2.5** — Unit tests in `back/lambdas/test/statements/parsers/llm-parser.test.ts`:
  - Mock Anthropic API responses (pre-recorded JSON fixtures).
  - Test Zod schema validation of well-formed and malformed responses.
  - Test retry on validation failure (first call returns invalid JSON, second returns valid).
  - Test post-processing: deterministic ordering, source/category normalisation, groupId computation for installments.
  - Test conservation check: passes when sum matches totalAmount, throws when it doesn't.
  - Test token usage logging is called with correct values.

- **Task 2.6** — Integration tests in `back/lambdas/test/statements/parsers/llm-parser.integration.test.ts`:
  - Real Anthropic API calls with fixture PDFs from `.claude/specs/statement-import/fixtures/`.
  - Gated behind `ANTHROPIC_API_KEY` env var — not run in CI by default.
  - Bank account fixture: canonical rows from Requirement 3 AC 8 are extracted, no `SALDO*` rows.
  - Credit card fixture: per-card aggregates match (7077.99 / 379.00 / 1603.47 / 116.96 / 4.07 / sum = 9181.49).
  - Installment suffix parsing, international IOF extraction, future-installment separation.

### Phase 3 — Backend Lambdas

All handlers wrapped with `withAuth` from `back/lambdas/src/shared/utils.ts`, use module-scope `docClient`, validate bodies with Zod, return `successResponse` / `errorResponse`.

- **Task 3.1** — `init-statement-upload.ts` (`POST /statements`):
  - Zod schema per design doc; HTTP 400 on invalid, 401 if no sub.
  - Generate `statementId` (uuid v4), `s3Key = statements/<sub>/<statementId>.<ext>`.
  - `PutCommand` to `laskifin-Statements` with `status: 'pending'`, `createdAt/updatedAt = now`, `errors: []`.
  - Pre-signed PUT URL via `@aws-sdk/s3-request-presigner`, expiry 600 s, returned with `statementId` + `expiresAt`.
  - Response 202.

- **Task 3.2** — `services/import-hash.ts`:
  - `buildImportHash(userId, { source, date, amount, description }): string` — sha256 hex. Pure function. Property-tested in Phase 6 (P-SI-3).

- **Task 3.3** — `services/reconciliation.ts`:
  - `reconcile(stmt, parsed): Promise<ReconciliationCandidate[]>`.
  - Branch on `stmt.documentType`:
    - `CREDIT_CARD`: query Ledger for `pk = USER#sub`, `sk begins_with TRANS#YYYY-MM#EXP#` across the 3-day window of months; filter in-memory where `amount === totalAmount` AND description matches the Itaú bill-payment regex `/(^|\s)(ITAU\s+BLACK|PAG\s+FATURA|FATURA\s+CARTAO|PAGAMENTO\s+CARTAO)/i`. Return `high` (1 match), `ambiguous` (≥2), `none` (0).
    - `BANK_ACCOUNT`: filter `parsed.extractedTransactions` for Itaú bill-payment pattern + `EXP`; for each, query `GSI_StatementsByDocumentTypeDueDate` with `documentTypeDueDate BETWEEN CREDIT_CARD#<date-3d> AND CREDIT_CARD#<date+3d>`; filter by `totalAmount === row.amount`.
  - `candidateId = sha256(parentSk + childStatementId).slice(0, 16)` for stable referencing from the client `acceptedReconciliationIds[]`.

- **Task 3.4** — `process-statement.ts` (S3 trigger, not API Gateway):
  - Handler signature `(event: S3Event) => Promise<void>`.
  - For each record: resolve Statement via `GSI_StatementsByS3Key`; transition status → `processing`; `GetObject` from S3; call `getParser(bank, documentType).parse(bytes)` — this routes to the LLM parser which handles the Anthropic API call and Secrets Manager retrieval internally; call `reconcile()`; single `UpdateCommand` to persist `extractedTransactions`, `futureInstallments`, `totalAmount`, `dueDate`, `documentTypeDueDate`, `reconciliationCandidates`, `status: 'done'`.
  - On throw: `status: 'failed'`, `errors: [...]`, do not rethrow (S3 retries are not helpful for parser bugs).
  - Never touches Ledger or Links (per BR-S30 / Requirement 2.8).
  - Note: No `pdfjs-dist` import, no ESM workaround. The LLM parser handles PDF processing via the Anthropic API.

- **Task 3.5** — `review-statement.ts` (`GET /statements/{statementId}`):
  - `GetCommand` for the Statement record — HTTP 404 if missing (masks cross-user access).
  - Compute `importHash` for each draft row; batch-query `GSI_LedgerByImportHash`; build `duplicates: { index, matchedLedgerSk }[]`.
  - Return full statement record plus `duplicates`.

- **Task 3.6** — `list-statements.ts` (`GET /statements`):
  - `QueryCommand` with `pk = USER#sub`, `sk begins_with STATEMENT#`, `ScanIndexForward: false`.
  - Project-out `extractedTransactions` — list view returns metadata only.

- **Task 3.7** — `confirm-statement-import.ts` (`POST /statements/{statementId}/confirm`):
  - Body: `{ selectedIndices: number[], acceptedReconciliationIds: string[], reconciliationChoices?: Record<candidateId, parentSk> }` (the optional `reconciliationChoices` resolves ambiguous candidates).
  - Validate bounds, HTTP 400 on empty selection or out-of-range index.
  - Duplicate filter: compute hash for each selected row, `GSI_LedgerByImportHash` lookup, split into `toWrite` + `skipped[]`.
  - `BatchWriteCommand` in chunks of 25 with up to 3 exponential-backoff retries on `UnprocessedItems`. For each new item: build SK via `TRANS#YYYY-MM#TYPE#uuid`, apply `.trim().toLowerCase()` to `category` and `source`, write `categoryMonth`, `importHash`, `sourceStatementId`, `groupId` (respect installment groupId from parser), `installmentNumber`, `installmentTotal`.
  - Call `updateMonthlySummary()` per written row.
  - For each accepted reconciliation candidate: iterate new Ledger SKs, issue `PutCommand` to `laskifin-Links` with deterministic `sk = buildLinkSk(parentSk, childSk)`, `linkId = buildLinkId(parentSk, childSk)`, `origin: 'statement-reconciliation'`, `originStatementId`, `ConditionExpression: 'attribute_not_exists(pk)'`. Catch `ConditionalCheckFailedException` as success; record everything else in `linkFailed[]`.
  - Final `UpdateCommand` on the Statement: `status: 'imported'`, `importedCount`, `REMOVE extractedTransactions`.
  - Response 200: `{ imported, skipped, linked, linkFailed }`.

- **Task 3.8** — `delete-statement.ts` (`DELETE /statements/{statementId}`):
  - HTTP 409 if `status === 'processing'`.
  - `DeleteObjectCommand` on the S3 key, `DeleteCommand` on the DDB item.
  - Never touches Ledger or Links (BR-S8).

- **Task 3.9** — Unit tests for every handler in `back/lambdas/test/statements/`. Mock AWS SDK with `aws-sdk-client-mock` (already used by existing handler tests — confirm during Phase 3.1; add as exact-pinned dep if absent). Mock Anthropic API responses for `process-statement.ts` tests (not pdfjs-dist).

### Phase 4 — CDK wiring (ApiStack)

- **Task 4.1** — In `infra/lib/api-stack.ts`, accept new props: `statementsTable`, `statementsTableName`, `statementsTableArn`.

- **Task 4.2** — Create `laskifin-statements` S3 bucket with `blockPublicAccess: BLOCK_ALL`, versioning, lifecycle `glacier after 90 days`, CORS allowing PUT from `frontendOrigin`, S3-managed encryption.

- **Task 4.3** — Create six `NodejsFunction` Lambdas using the existing helper pattern (`cognitoMethod`). Memory/timeout per Requirement 9:
  - `init-statement-upload` — 256 MB / 10 s.
  - `process-statement` — 512 MB / **90 s** (increased from 60 s to accommodate LLM API latency). Standard CJS bundling — **no ESM workaround** needed (`@anthropic-ai/sdk` works with CJS, unlike `pdfjs-dist` which required `format: ESM` + `banner` with `createRequire`).
  - `review-statement` — 256 MB / 10 s.
  - `confirm-statement-import` — 512 MB / 30 s.
  - `list-statements` — 256 MB / 10 s.
  - `delete-statement` — 256 MB / 10 s.

- **Task 4.4** — Environment variables per handler exactly as specced in Requirement 9.8. IAM grants exactly as specced in Requirement 9.7 — use `grantReadData`/`grantWriteData`/`grantReadWriteData`; never wildcard. Additionally for `process-statement`:
  - Add `ANTHROPIC_SECRET_NAME = 'laski/anthropic-api-key'` environment variable.
  - Add `secretsmanager:GetSecretValue` IAM grant via `Secret.fromSecretNameV2(this, 'AnthropicSecret', 'laski/anthropic-api-key').grantRead(processStatementHandler)`.

- **Task 4.5** — S3 event notification: `statementsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(processStatementHandler), { prefix: 'statements/' })`. API Gateway is NOT wired to `process-statement`.

- **Task 4.6** — API routes using the existing `cognitoMethod(resource, method, handler, authorizer)` helper:
  - `POST /statements` → `init-statement-upload`.
  - `GET /statements` → `list-statements`.
  - `GET /statements/{statementId}` → `review-statement`.
  - `POST /statements/{statementId}/confirm` → `confirm-statement-import`.
  - `DELETE /statements/{statementId}` → `delete-statement`.

- **Task 4.7** — CDK assertion test `infra/test/statements-api-stack.test.ts`:
  - All five routes exist with correct method + Cognito authorizer.
  - Each Lambda has correct memory/timeout/runtime (Node 22.x); `process-statement` has **90 s** timeout.
  - Env vars are set per handler per Requirement 9.8; `ANTHROPIC_SECRET_NAME` is set on `process-statement`.
  - Secrets Manager read grant exists on `process-statement`.
  - S3 bucket has BlockPublicAccess.ALL, versioning, lifecycle rule.
  - S3 event notification wired to `process-statement` with prefix `statements/`.
  - IAM grants match Requirement 9.7 (use `Match.objectLike` on IAM policy docs).
  - No ESM bundling configuration on `process-statement` (verify absence of `format: ESM` and `banner`).

### Phase 5 — Frontend

- **Task 5.1** — `front/src/api/statements.ts`: types + functions mirroring the five endpoints. Uploading the file is a separate `fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })` call — not wrapped with auth.

- **Task 5.2** — `StatementImportPage.tsx` — two-step form:
  - Step 1: `documentType` + `bank` select.
  - Step 2: file drop + upload progress + polling.
  - On `status === 'done'`: render `<ReviewTable>` + `<ReconciliationBanner>`.
  - On `status === 'failed'`: inline error with first `errors[]` message + retry.
  - On success: POST confirm → toast with per-row results → navigate to `/transactions`.

- **Task 5.3** — Route `/statements/import` in `routes.tsx` inside `<ProtectedRoute>`, plus nav link.

- **Task 5.4** — `ReviewTable.tsx`:
  - Checkbox per row, default checked except rows flagged in `duplicates[]`.
  - Editable `category` / `source` cells (Chakra UI `Editable`).
  - Summary footer: selected count + sum.
  - Section divider between main transactions and `futureInstallments` (read-only informational rows).

- **Task 5.5** — `ReconciliationBanner.tsx`:
  - Renders one banner per `reconciliationCandidate`.
  - `high`: "We detected this bill was paid from your Itaú checking account on DD/MM/YYYY for R$ X. Link all N charges to the bank payment?" + single Accept button.
  - `ambiguous`: shows `candidateParents[]` in a radio list, Accept enabled after selection.
  - `none`: informational "no corresponding bank payment found" with "upload checking account statement" link.

- **Task 5.6** — Frontend unit tests (Vitest + RTL) for `ReviewTable` and `ReconciliationBanner` in `front/src/components/__tests__/`. No new frontend property tests required — backend owns the correctness properties.

### Phase 6 — Property-based tests (P-SI-1 … P-SI-6)

All in `back/lambdas/test/statements/properties/`, one file per property, `numRuns: 100`, tag comment `// Feature: statement-import, Property <N>: ...`.

- **Task 6.1** — `p-si-1-conservation.test.ts` — Generate synthetic `ParseResult` objects with known `totalAmount` and `extractedTransactions`. Assert `Math.abs(sum(extractedTransactions.amount) - totalAmount) < 0.01`. Tests the conservation check logic independent of the LLM call.
- **Task 6.2** — `p-si-2-no-balance-rows.test.ts` — Generate synthetic `ExtractedTransaction[]` arrays including balance-line descriptions. Assert the post-extraction validation filter rejects balance-line descriptions (`SALDO ANTERIOR`, `SALDO TOTAL DISPONÍVEL DIA`). Tests validation logic against synthetic data, not LLM output.
- **Task 6.3** — `p-si-3-import-idempotency.test.ts` — unit-test `confirmImport` twice in a row, assert the second run returns 0 imported, N skipped.
- **Task 6.4** — `p-si-4-reconciliation-exactness.test.ts` — synthetic `(bankStmt, cardStmt)` pairs; assert exactly one `high` candidate when the pay row + total + window line up.
- **Task 6.5** — `p-si-5-link-count.test.ts` — after accepted reconciliation with `childCount = N`, Links table gains exactly N items; second run gains 0.
- **Task 6.6** — `p-si-6-user-isolation.test.ts` — U1 uploads, U2 calls each of the five endpoints — all return 404 (not 403).

### Phase 7 — Arbitraries & shared test utilities

- **Task 7.1** — `back/lambdas/test/statements/properties/arbitraries.ts`:
  - `fc.record` generators for `ExtractedTransaction` (used by P-SI-1..6).
  - `fc.record` generators for `ParseResult` with synthetic `totalAmount` and `extractedTransactions`.
  - **Removed**: synthetic Itaú bank-account row string generators (no longer needed — regex parsers removed).
  - **Removed**: synthetic Itaú card-bill row string generators (no longer needed — regex parsers removed).

---

## Verification

### Local

```bash
npm ci                                         # root
npm test --workspace=back/lambdas              # Phase 2, 3, 6
npm test --workspace=infra                     # Phase 1, 4
npm test --workspace=front                     # Phase 5
```

### CDK synth (dev)

```bash
npx cdk synth --strict -c env=dev -c googleOAuthClientId=368028870-r89ptm9ri1l5hs8akpn8b6j7varhjiin.apps.googleusercontent.com
```

Should produce a clean template with the new `laskifin-statements` bucket, `laskifin-Statements` table + 2 GSIs, new `GSI_LedgerByImportHash` on the Ledger, and six new Lambdas. The `process-statement` Lambda should have:
- 90 s timeout (not 60 s)
- `ANTHROPIC_SECRET_NAME` env var
- Secrets Manager read grant
- Standard CJS bundling (no ESM format or createRequire banner)

### Deploy to dev

```bash
npx cdk deploy --all -c env=dev -c googleOAuthClientId=368028870-r89ptm9ri1l5hs8akpn8b6j7varhjiin.apps.googleusercontent.com
```

### End-to-end smoke test (manual, uses the two real PDFs)

Per design doc §"End-to-end smoke test":

1. Upload `extrato-lancamentos_conta.pdf` → confirm all ~30 rows → Ledger gains 30 entries, one is `ITAU BLACK 3102-2305 9181.49 EXP`.
2. Upload `extrato-lancamentos_cartao.pdf` → wait for `status = 'done'` → review screen shows one `confidence: 'high'` reconciliation banner pointing at the bank debit.
3. Accept reconciliation → Ledger gains ~100 entries, Links gains ~100 items.
4. Open the bank debit's detail page → `LinkWidget` shows "This entry pays for: ~100 charges".
5. Open any card charge → `LinkWidget` shows "Paid by: ITAU BLACK 3102-2305 R$ 9.181,49".
6. Re-upload the same card bill → confirm all rows → response shows 100 `skipped`, 0 `imported`, 0 new links (idempotency, P-SI-3 + P-SI-5).

---

## Execution order summary

```
Task 0.1  (commit sample PDFs)
  ├─ Phase 1 (DataStack + import-hash GSI)
  ├─ Phase 2 (LLM parser — depends on Anthropic API key in Secrets Manager, which already exists)
  ├─ Phase 3 (handlers — depends on Phase 2)
  ├─ Phase 4 (ApiStack wiring — depends on Phases 1 & 3)
  ├─ Phase 5 (frontend — depends on Phase 4 being deployed to dev for manual testing)
  ├─ Phase 6 + 7 (property tests + arbitraries — can start in parallel with Phase 2; must complete by Phase 3 end)
  └─ Verification (CDK synth → deploy dev → manual smoke test)
```

Phases 2 and 6/7 can run in parallel with Phase 1. Phase 2 no longer has a dependency on `pdfjs-dist` — it depends on the Anthropic API key being in Secrets Manager (which it already is). Phase 3 blocks on Phase 2. Phase 4 blocks on Phases 1 and 3. Phase 5 blocks on Phase 4 being deployed.

---

## Deferred (not part of this plan)

Explicit non-goals, tracked in design §"Open Questions / Future Work":

- Auto-categorisation rules for bank-account rows.
- PT→EN category translation.
- Multi-bank support (Nubank, XP) — the LLM parser is already bank-agnostic, but prompt tuning and fixture tests for new banks are deferred.
- CSV parser (spec promises CSV but this plan covers PDF only).
- SQS DLQ on the S3 event.
- PII redaction of uploaded PDFs post-parse.
- Prompt versioning and regression testing framework.
- Prompt caching for cost optimization.
