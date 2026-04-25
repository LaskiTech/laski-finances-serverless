# Requirements Document — Statement Import & Reconciliation

## Introduction

The Statement Import feature allows users to upload two types of bank documents — a **checking account statement** and a **credit card bill** — and have the system automatically extract the transactions, normalise them, persist them as Ledger entries, and **reconcile** semantic relationships between the two documents.

Transaction extraction is performed by sending the uploaded PDF directly to the **Anthropic Messages API** (Claude) as a base64-encoded `document` content block. Claude's native PDF support processes each page as text + image, making it robust against complex layouts (two-column credit card bills, varying bank formats) without per-bank regex parsers. The LLM is instructed via a structured prompt to return transactions in the existing `ExtractedTransaction` JSON schema, and the response is validated with Zod. This approach is **bank-agnostic** — the same prompt works for any bank's PDF. The `bank` field on the Statement record becomes informational context passed to the prompt rather than a parser selector.

The canonical reconciliation case, derived from the sample documents for this spec, is:

- The user uploads `extrato-lancamentos_conta.pdf` (Itaú checking account, April 2026). One of the debits on the bill's due date is `20/04/2026 ITAU BLACK 3102-2305 -9.181,49`.
- The user uploads `extrato-lancamentos_cartao.pdf` (Itaú Mastercard Black, fatura due on `20/04/2026`). The total of the bill is `R$ 9.181,49` and it contains ~100 individual line items spread across three plastic cards (finals 1509, 0950, 6007) plus international purchases.
- The single checking-account debit of `-9.181,49` **is the settlement** of all the credit card line items above. The system must detect this relationship and create a one-to-many link between the checking-account Parent_Entry and every credit card Child_Entry produced from the bill.

This spec is **Phase 3** of the roadmap defined in `project-overview.md`. It depends on:

- Phase 1: Transaction CRUD (`transaction-crud-*`) — already deployed.
- Phase 2: Linking Layer (`linking-layer-*`) — `laskifin-Links` table, `POST /links`, `GET /links`, `DELETE /links/{id}` — specced. This feature reuses the linking layer; it does not introduce a new link model.
- Supporting table: `laskifin-Statements` (defined in `data-model.md`, deferred until now).

All coding standards in `coding-standards.md` apply without exception.

## Glossary

- **Statement**: An uploaded file representing a bank document. Two document types are supported: `BANK_ACCOUNT` (checking account statement) and `CREDIT_CARD` (credit card bill).
- **Statement_ID**: UUID that uniquely identifies a Statement record in `laskifin-Statements`. Returned to the client on upload initiation and used for status polling.
- **LLM_Parser**: A single parser module (`parsers/llm-parser.ts`) that sends the raw PDF bytes to the Anthropic Messages API (Claude) as a base64-encoded `document` content block and receives structured `ExtractedTransaction[]` in response. Replaces the previous per-bank regex parsers. The same parser handles all `(bank × documentType)` combinations.
- **Extracted_Transaction**: A draft transaction produced by the LLM_Parser. Has the same shape as a Ledger entry but is stored as a list on the Statement item until the user confirms the import.
- **Import**: The act of writing confirmed `ExtractedTransaction[]` into `laskifin-Ledger` as real entries.
- **Bill_Payment_Entry**: A single Ledger entry in a checking account whose description matches a "credit card bill payment" heuristic (e.g. `ITAU BLACK`, `PAG FATURA`, `CARTAO`). In the sample document, this is the `ITAU BLACK 3102-2305` debit for `-9.181,49` on `20/04/2026`.
- **Reconciliation**: The process of detecting that a Bill_Payment_Entry on a checking account statement corresponds to the set of charges on a credit card bill, and proposing Links between them.
- **Reconciliation_Candidate**: A proposed Link that the system has detected but that the user has not yet confirmed.
- **Statements_Table**: The DynamoDB table `laskifin-Statements` — tracks upload lifecycle.
- **Statements_Bucket**: The S3 bucket `laskifin-statements` — stores uploaded PDF/CSV files.
- **Init_Upload_Handler**: Lambda `init-statement-upload.ts`. Returns a pre-signed S3 URL and creates the Statement record with status `pending`.
- **Process_Statement_Handler**: Lambda `process-statement.ts`. Triggered by S3 ObjectCreated event. Runs the LLM_Parser, populates `extractedTransactions`, updates status to `done`.
- **Review_Handler**: Lambda `review-statement.ts`. Returns the draft transactions and any `ReconciliationCandidate[]` to the frontend.
- **Confirm_Import_Handler**: Lambda `confirm-statement-import.ts`. Batch-writes selected Extracted_Transactions to `laskifin-Ledger`, updates `laskifin-MonthlySummary`, and creates the confirmed Links via the existing Linking Layer.
- **Delete_Statement_Handler**: Lambda `delete-statement.ts`. Deletes a Statement record and its S3 object. Does not touch Ledger entries already imported from it.

## Business Rules

### File intake & lifecycle

- **BR-S1**: Supported file formats on ingest are `application/pdf` and `text/csv`. Other MIME types are rejected at upload-init time with HTTP 400.
- **BR-S2**: Maximum uploaded file size is 10 MB. Enforced via the pre-signed URL's `Content-Length-Range` condition.
- **BR-S3**: Every Statement has a `documentType` field set at upload-init time by the user: `BANK_ACCOUNT` or `CREDIT_CARD`. A single LLM_Parser handles all `(bank × documentType)` combinations. The `bank` and `documentType` fields are passed to the LLM prompt as context but do not determine which parser code runs.
- **BR-S4**: `bank` defaults to `ITAU` in the MVP — it is an enum field so that additional banks can be added without schema changes. The LLM_Parser attempts extraction for any bank. If the LLM cannot extract meaningful data from the document, it returns an empty transaction list or the parser throws with a descriptive error.
- **BR-S5**: A Statement moves through a state machine: `pending → processing → done` (success) or `pending → processing → failed` (parser error). Statuses are owned by Process_Statement_Handler. Timestamps `createdAt` and `updatedAt` are maintained on every transition.
- **BR-S6**: Processing is asynchronous. The Init_Upload_Handler returns HTTP 202 immediately with the `statementId`; the frontend polls `GET /statements/{statementId}` until `status === 'done'` or `'failed'`.
- **BR-S7**: Statement records are per-user. `pk = USER#<cognitoSub>`, `sk = STATEMENT#<statementId>`. Cross-user access is forbidden; requests for another user's `statementId` return HTTP 404 (not 403).
- **BR-S8**: Deleting a Statement deletes the S3 object and the DDB record. Ledger entries that were previously imported from it remain — they are not cascaded. Already-created Links remain as well.

### Extraction correctness

- **BR-S9**: Every extracted row must populate all of: `date` (ISO 8601), `description` (non-empty string), `amount` (positive number — the sign is encoded separately via `type`), `type` (`INC` or `EXP`), `source` (bank or card identifier — see below), `category` (either taken from the document if present, else `uncategorized`).
- **BR-S10**: Balance lines (`SALDO ANTERIOR`, `SALDO TOTAL DISPONÍVEL DIA`, `Total desta fatura`, `Total da fatura anterior`, etc.) are **not** transactions and MUST be filtered out. The LLM prompt explicitly instructs exclusion of balance, summary, and header lines. They never appear in `extractedTransactions`.
- **BR-S11**: For checking account documents, the `source` field is set to the account identifier (e.g. `itau-corrente-9670-00293-1`) derived from the header of the document. The LLM prompt instructs extraction of the source from the document header. Source strings are normalised per `coding-standards.md` (trim + lowercase).
- **BR-S12**: For credit card documents, the `source` field is set to the card identifier (e.g. `itau-black-1509`, `itau-black-0950`, `itau-black-6007`) derived from the card section headers. The LLM prompt instructs grouping transactions by plastic card. Multi-card bills produce transactions grouped by plastic.
- **BR-S13**: For credit card documents, `category` is taken from the category line associated with each transaction (e.g. `ALIMENTAÇÃO`, `VEÍCULOS`, `HOBBY`, `DIVERSOS`, `SAÚDE`, `VESTUÁRIO`, `EDUCAÇÃO`, `TURISMO E ENTRETENIM.`). The LLM prompt instructs stripping the city suffix (e.g. `.FORTALEZA`). Category is then `.trim().toLowerCase()` normalised per `coding-standards.md`. An untranslated Portuguese value is acceptable in the MVP — a follow-up task covers PT→EN category mapping.
- **BR-S14**: For credit card documents, an installment marker in the description (e.g. `SAMSUNG NO ITAU 10/21` meaning "installment 10 of 21") is detected by the LLM. The prompt instructs the LLM to detect installment patterns and populate `installmentNumber`, `installmentTotal`, and `groupId`. The parser creates **one** Ledger entry for the current billing period only — it does NOT expand into 21 entries. The installment context (`installmentNumber`, `installmentTotal`, `groupId`) is still populated: `installmentNumber` is the current index, `installmentTotal` is the total, and `groupId` is a deterministic UUID derived from `description_without_counter + first_card_date`. Future installments will appear on subsequent bills and will reuse the same `groupId` via the same deterministic hash.
- **BR-S15**: Credit card bills may contain a `Compras parceladas - próximas faturas` section (future-dated installments). Transactions in that section are **informational only** and MUST NOT be written to the Ledger. The LLM_Parser captures them as a separate `futureInstallments: ExtractedInstallmentPreview[]` field on the Statement record, shown in the UI for context but not imported.
- **BR-S16**: Credit card international purchases (section `Lançamentos internacionais`) MUST be extracted using the BRL value (`R$` column), not the USD value. IOF repasse (`Repasse de IOF em R$`) is extracted as a separate "fee" transaction with category `fees` and description `IOF — <original description>`. Dollar conversion rate is captured in the extracted row's metadata for auditing but not used for the amount. The LLM prompt includes explicit instructions for handling international purchases and IOF.
- **BR-S17**: Date parsing for the credit card bill uses the `DD/MM` format from the "Lançamentos" columns. The year is inferred from the bill's `Postagem` date header: if the transaction month is `<= postagemMonth`, the year is `postagemYear`; otherwise `postagemYear - 1` (this handles, for example, a `14/06` line on a bill posted `14/04/2026` — the purchase is from 2025, back-dated because it is a SAMSUNG installment marker). The LLM prompt instructs the model to use the document's posting date to infer the correct year for DD/MM dates. Future-installment dates (preview section) are interpreted as **future** using the inverse rule.

### Idempotency & duplicate prevention

- **BR-S18**: Re-uploading the same file produces a new `statementId` — the system does not deduplicate statement records themselves.
- **BR-S19**: At import time (Confirm_Import_Handler), each `ExtractedTransaction` is hashed as `sha256(userId + source + date + amount + description)`. The hash is stored on the resulting Ledger item as `importHash`. Before writing, the handler queries `GSI_LedgerByImportHash` for the same `pk + importHash`. If a match exists, the Extracted_Transaction is skipped and reported as `skipped` in the response body. This makes repeated imports of the same statement idempotent on the Ledger.
- **BR-S20**: `importHash` is only written on entries that originated from a statement import. Manual entries created via `POST /transactions` do not have `importHash`. The GSI uses a sparse index definition so manual entries are not indexed.

### Reconciliation between bank account ↔ credit card bill

- **BR-S21**: Reconciliation is triggered inside Process_Statement_Handler for `CREDIT_CARD` statements, after extraction succeeds and before status transitions to `done`. It is also triggered for `BANK_ACCOUNT` statements immediately after their own extraction — both directions look for a counterpart.
- **BR-S22**: For a `CREDIT_CARD` statement with total `T` and due date `D`, the reconciliation logic queries `laskifin-Ledger` for the authenticated user with `source` equal to any of the user's known checking-account sources and SK prefix `TRANS#YYYY-MM#EXP#` (where YYYY-MM spans a window of `[D - 3 days, D + 3 days]`). Among those results, a Bill_Payment_Entry is identified as one whose `amount` equals `T` **and** whose `description` matches one of the configured "bill payment" patterns for the parsed bank (for Itaú: `/(^|\s)(ITAU\s+BLACK|PAG\s+FATURA|FATURA\s+CARTAO|PAGAMENTO\s+CARTAO)/i`).
- **BR-S23**: If exactly one Bill_Payment_Entry is found in BR-S22, a `ReconciliationCandidate` is produced with `confidence = 'high'`. It proposes one Link per credit card transaction in the bill, using the Bill_Payment_Entry as the parent.
- **BR-S24**: If zero Bill_Payment_Entries are found, the candidate is produced with `confidence = 'none'` (no parent) and the UI surfaces this to the user as "no corresponding bank payment found — upload checking account statement?".
- **BR-S25**: If more than one Bill_Payment_Entry matches (e.g. rare case of multiple identical debits in the date window), `confidence = 'ambiguous'` and the UI prompts the user to pick which one is the true settlement.
- **BR-S26**: Regardless of confidence, no Links are actually written to `laskifin-Links` until the user explicitly confirms them in the review screen. Reconciliation is a **proposal**, not an automatic mutation.
- **BR-S27**: When the user confirms a high-confidence reconciliation, the Confirm_Import_Handler:
  1. Imports the N credit card Extracted_Transactions to the Ledger.
  2. Iterates the new Ledger SKs and issues N `PutCommand` calls to `laskifin-Links` with `parentSk = billPaymentEntry.sk` and `childSk = eachNewLedgerSk`, reusing the deterministic-sk approach described in `linking-layer-design.md`. If the import completes but some link writes fail (e.g. duplicate), partial success is acceptable per BR-S28.
- **BR-S28**: Link creation during reconciliation is best-effort. If a given Link write fails (e.g. network, conditional-check), the handler logs and continues. The response body returns a per-transaction result (`imported`, `linked`, `importSkipped`, `linkFailed`) so the UI can show exactly what happened.
- **BR-S29**: Reconciliation is one-way directed: **the checking-account debit is the parent**, individual credit card charges are children. Rationale: the settlement event is the one that moves cash and "pays for" the purchases, matching the existing Linking Layer's semantic model.
- **BR-S30**: Reconciliation never writes to the Ledger. It only proposes links over Ledger entries that already exist (from a past or current import). This keeps the Ledger immutable from the reconciliation layer's perspective and is consistent with the linking layer's design decision 1 in `linking-layer-design.md`.

## Requirements

### Requirement 1: Initiate Upload

**User Story:** As a user, I want to upload a bank statement file, so that the system can extract my transactions automatically instead of me typing them in.

#### Acceptance Criteria

1. WHEN the user sends `POST /statements` with a valid payload, THE Init_Upload_Handler SHALL create a Statement record in `laskifin-Statements` with `status = 'pending'`, generate a pre-signed S3 PUT URL for the Statements_Bucket, and return HTTP 202 with `{ statementId, uploadUrl, expiresAt }`.
2. THE request body SHALL contain: `filename` (non-empty string, ≤ 255 chars), `contentType` (one of `application/pdf`, `text/csv`), `documentType` (one of `BANK_ACCOUNT`, `CREDIT_CARD`), and `bank` (currently one of `ITAU`).
3. THE pre-signed URL SHALL expire in 10 minutes and enforce `Content-Length-Range: 0..10485760` (10 MB).
4. THE Statement's `s3Key` SHALL be `statements/<cognitoSub>/<statementId>.<ext>`, where `<ext>` is derived from `contentType`.
5. IF `contentType` is not in the allowed list, THE Init_Upload_Handler SHALL return HTTP 400 with message `"Unsupported file type"`.
6. IF `documentType` is not in the allowed list, THE Init_Upload_Handler SHALL return HTTP 400.
7. IF the Cognito sub claim is missing, THE Init_Upload_Handler SHALL return HTTP 401.
8. IF the request body is missing or invalid JSON, THE Init_Upload_Handler SHALL return HTTP 400.

### Requirement 2: Asynchronous Extraction

**User Story:** As a user, I want extraction to happen in the background so the upload returns immediately, and I can poll for progress.

#### Acceptance Criteria

1. WHEN an object is created under the key prefix `statements/` in the Statements_Bucket, THE S3 event SHALL invoke Process_Statement_Handler.
2. THE Process_Statement_Handler SHALL resolve the Statement record from `laskifin-Statements` using the `s3Key` attribute (GSI on `s3Key`), transition its status to `processing`, and set `updatedAt`.
3. THE Process_Statement_Handler SHALL invoke the LLM_Parser, passing the raw PDF bytes, `statement.bank`, and `statement.documentType` as context. The LLM_Parser handles all bank and document type combinations via the same code path. The `bank` and `documentType` fields are included in the prompt as context to help the LLM understand the document structure.
4. THE LLM_Parser SHALL produce `ExtractedTransaction[]` and — for credit card statements — `ExtractedInstallmentPreview[]` for the "Compras parceladas - próximas faturas" section.
5. WHEN the LLM_Parser finishes without throwing, THE Process_Statement_Handler SHALL invoke the Reconciliation_Service (Requirement 5), attach any resulting `ReconciliationCandidate[]` to the Statement record, set `status = 'done'`, set `extractedCount = extractedTransactions.length`, and write the list to the Statement record's `extractedTransactions` attribute.
6. IF the LLM_Parser throws (including Zod validation failure after retry — see Requirement 11), THE Process_Statement_Handler SHALL set `status = 'failed'`, append the error message to `errors[]`, and return successfully (the Lambda's response itself is discarded by the S3 invocation path).
7. THE Process_Statement_Handler SHALL complete within 90 seconds for files up to 10 MB. Memory is 512 MB. Timeout is 90 s.
8. THE Process_Statement_Handler SHALL never mutate `laskifin-Ledger` or `laskifin-Links` — extraction is read-only with respect to the user's ledger.

### Requirement 3: Extract Checking Account Statement via LLM

**User Story:** As a user, I want my bank account PDF to be correctly parsed into individual income and expense entries, regardless of which bank issued it.

#### Acceptance Criteria

1. WHEN Process_Statement_Handler invokes the LLM_Parser with raw PDF bytes and `documentType = 'BANK_ACCOUNT'`, THE LLM_Parser SHALL send the PDF as a base64-encoded `document` content block to the Anthropic Messages API using the `@anthropic-ai/sdk` TypeScript package, model `claude-sonnet-4-6`, and `temperature: 0`.
2. THE LLM prompt SHALL instruct Claude to extract each transaction row from the document, returning a JSON array conforming to the `ExtractedTransaction` schema. The prompt SHALL explicitly instruct exclusion of balance lines (`SALDO ANTERIOR`, `SALDO TOTAL DISPONÍVEL DIA`, `SALDO DO DIA`, `SALDO FINAL DO PERÍODO`), disclaimer footers, and any line that is not an actual financial transaction.
3. THE LLM_Parser SHALL validate the response against the `ExtractedTransaction[]` Zod schema. IF validation fails, THE parser SHALL retry once with a more explicit prompt (see Requirement 11 AC 4). IF the retry also fails validation, THE parser SHALL throw.
4. THE LLM_Parser SHALL interpret a negative value (leading `-` sign or column indicating debit) as `type = 'EXP'` and a positive value as `type = 'INC'`. The stored `amount` is always `Math.abs(rawValue)`. This logic is enforced both in the prompt instructions and in post-processing code.
5. THE LLM prompt SHALL instruct extraction of `source` from the document header (e.g. account identifier `agência: NNNN  conta: NNNNN-N`), normalised to a slug format like `itau-corrente-<agencia>-<conta>` (lowercase, dashes).
6. THE LLM_Parser SHALL set `category = 'uncategorized'` for all bank account rows unless the document contains explicit category information.
7. THE LLM_Parser SHALL produce a deterministic ordering of `ExtractedTransaction[]` by (date ascending, order-in-document) so that repeated parsing of the same file yields the same list.
8. GIVEN the sample file `extrato-lancamentos_conta.pdf`, THE LLM_Parser SHALL produce at least these canonical rows (acceptance fixtures):
   - `2026-04-01  PIX TRANSF JOACIR 01/04   15.00   EXP   itau-corrente-9670-00293-1   uncategorized`
   - `2026-04-20  ITAU BLACK 3102-2305      9181.49 EXP   itau-corrente-9670-00293-1   uncategorized`
   - `2026-04-20  PIX TRANSF KIOSHI 18/04   12676.07 INC  itau-corrente-9670-00293-1   uncategorized`
   - and SHALL NOT produce any row whose description is `SALDO TOTAL DISPONÍVEL DIA` or `SALDO ANTERIOR`.

### Requirement 4: Extract Credit Card Bill via LLM

**User Story:** As a user, I want my credit card PDF bill to be correctly parsed, including multi-plastic cards, installments, and international purchases, without requiring bank-specific regex code.

#### Acceptance Criteria

1. WHEN Process_Statement_Handler invokes the LLM_Parser with raw PDF bytes and `documentType = 'CREDIT_CARD'`, THE LLM_Parser SHALL send the PDF as a base64-encoded `document` content block to the Anthropic Messages API using the `@anthropic-ai/sdk` TypeScript package, model `claude-sonnet-4-6`, and `temperature: 0`.
2. THE LLM prompt SHALL instruct Claude to recognise plastic-card section headers (e.g. `KIOSHI IOSIMUTA (final NNNN)`) and set the `source` for subsequent rows to a slug like `itau-black-<NNNN>`.
3. THE LLM prompt SHALL instruct Claude to recognise the international section (`Lançamentos internacionais`) and apply the BRL value (not USD) as the `amount`, per BR-S16. IOF repasse SHALL be emitted as a separate synthetic transaction with `category = 'fees'`.
4. THE LLM prompt SHALL instruct Claude to apply the year inference rule from BR-S17 to every extracted row's `DD/MM` date, using the document's posting date as context.
5. THE LLM prompt SHALL instruct Claude to detect installment suffixes (e.g. `10/21` meaning "installment 10 of 21") on the description, extract `installmentNumber` and `installmentTotal`, and strip the suffix from the stored `description`. The `groupId` SHALL be a deterministic UUID v5 derived from `(normalised description) + (first-known-card-date if any else date of this row)`.
6. THE LLM prompt SHALL instruct Claude to extract `category` from the line immediately below each transaction line, strip the city suffix (`.CAPITAL`), and apply lowercase + trim normalisation.
7. THE LLM_Parser SHALL exclude every line in the `Compras parceladas - próximas faturas` section from `extractedTransactions`, but SHALL include them in a separate `futureInstallments` field on the Statement record (per BR-S15).
8. THE LLM prompt SHALL instruct Claude to exclude summary lines such as `Lançamentos no cartão (final NNNN) <total>`, `Total transações inter. em R$`, `Total desta fatura`, `Pagamento efetuado em`, and `Saldo financiado`.
9. GIVEN the sample file `extrato-lancamentos_cartao.pdf`, THE LLM_Parser SHALL produce exactly these aggregate totals — summing per card identifier:
   - `itau-black-1509`: sum of `amount` where `type = 'EXP'` equals **7077.99**
   - `itau-black-0950`: equals **379.00**
   - `itau-black-6007`: equals **1603.47**
   - `itau-black-6007` international (BRL): equals **116.96**
   - IOF fee transaction: `4.07`
   - `7077.99 + 379.00 + 1603.47 + 116.96 + 4.07 = 9181.49` — equals the `Total desta fatura` header.
   A conservation check SHALL verify that `sum(extractedTransactions.amount) === totalDestaFatura` for credit card bills where `totalAmount` is available. If the check fails, the parser throws.
10. THE LLM_Parser SHALL NOT emit any row for the `Pagamento efetuado em DD/MM/YYYY -R$ X` line — that is the payment of the PREVIOUS bill and does not belong in the current bill's extracted transactions.

### Requirement 5: Reconcile Credit Card Bill ↔ Checking Account Payment

**User Story:** As a user, I want the system to automatically detect that the R$ 9,181.49 debit in my bank account "ITAU BLACK" is the payment for the whole credit card bill, so that I can confirm the link in one click instead of creating ~100 links manually.

#### Acceptance Criteria

1. WHEN a Statement with `documentType = 'CREDIT_CARD'` completes extraction, THE Reconciliation_Service SHALL perform the query described in BR-S22 to find a candidate Bill_Payment_Entry.
2. WHEN a Statement with `documentType = 'BANK_ACCOUNT'` completes extraction, THE Reconciliation_Service SHALL inspect the extracted rows for any whose description matches the Itaú bill-payment pattern (`/(^|\s)(ITAU\s+BLACK|PAG\s+FATURA|FATURA\s+CARTAO|PAGAMENTO\s+CARTAO)/i`) AND whose value is negative. For each such row, it SHALL query `laskifin-Statements` (GSI on `documentType + dueDate`) for the authenticated user's `CREDIT_CARD` statements whose `totalAmount == abs(row.amount)` and whose `dueDate` is within `[row.date - 3 days, row.date + 3 days]`.
3. THE Reconciliation_Service SHALL attach a `reconciliationCandidates[]` array to the Statement record. Each candidate has: `confidence` (`'high' | 'ambiguous' | 'none'`), `parentStatementId` (the bank account statement), `parentSk` (the Bill_Payment_Entry's SK — `undefined` when `confidence = 'none'`), `childStatementId` (the credit card statement), `candidateParents[]` (only populated when `confidence = 'ambiguous'`, list of possible parent SKs for the user to choose from), `totalAmount`, and `childCount`.
4. IF the Bill_Payment_Entry already exists in `laskifin-Ledger` (i.e. the user uploaded the checking account statement first and already imported it), THE `parentSk` on the candidate SHALL point to that existing Ledger SK — no new Ledger entries are proposed for the parent.
5. IF the Bill_Payment_Entry has been extracted but not yet imported (both statements uploaded before either is confirmed), THE candidate SHALL reference the parent via its future SK placeholder, and the Confirm_Import_Handler SHALL resolve it at import time.
6. THE Reconciliation_Service SHALL never create `laskifin-Links` items directly. It only produces candidates. Writes happen only via Confirm_Import_Handler after user confirmation.
7. WHERE the sample documents `extrato-lancamentos_conta.pdf` and `extrato-lancamentos_cartao.pdf` are both uploaded and both have `status = 'done'`, the credit card statement record SHALL contain exactly one `reconciliationCandidate` with `confidence = 'high'`, `totalAmount = 9181.49`, `childCount = <number of extracted rows in the bill>`, and `parentSk` referencing the `ITAU BLACK 3102-2305` entry.

### Requirement 6: Review Draft Transactions

**User Story:** As a user, I want to see what the system extracted from my statement before it writes anything to my ledger, so that I can drop rows that are wrong and correct categories.

#### Acceptance Criteria

1. WHEN the user sends `GET /statements/{statementId}`, THE Review_Handler SHALL return the Statement record including: `status`, `extractedCount`, `importedCount`, `errors`, `extractedTransactions` (full list of draft rows with a stable client-side index), `futureInstallments` (if any), and `reconciliationCandidates`.
2. THE response SHALL also include a `duplicates` array, each entry being `{ index, matchedLedgerSk }`, populated by running the BR-S19 hash lookup for every extracted row. This lets the UI pre-mark duplicates as skipped.
3. IF the Statement belongs to a different user, THE Review_Handler SHALL return HTTP 404.
4. IF the Cognito sub claim is missing, THE Review_Handler SHALL return HTTP 401.
5. IF the `statementId` does not exist for the authenticated user, THE Review_Handler SHALL return HTTP 404.
6. THE Review_Handler SHALL NOT mutate the Statement record.

### Requirement 7: Confirm Import

**User Story:** As a user, I want to click "Confirm import" after reviewing, and have the system write all the approved transactions to my ledger and create the proposed links.

#### Acceptance Criteria

1. WHEN the user sends `POST /statements/{statementId}/confirm` with body `{ selectedIndices: number[], acceptedReconciliationIds: string[] }`, THE Confirm_Import_Handler SHALL batch-write the selected `ExtractedTransaction[]` to `laskifin-Ledger` using `BatchWriteCommand` in chunks of 25.
2. THE Confirm_Import_Handler SHALL, for each written Ledger item, call `updateMonthlySummary()` per `coding-standards.md`.
3. THE Confirm_Import_Handler SHALL compute `importHash` (per BR-S19) for each selected row and, before writing, query `GSI_LedgerByImportHash` for duplicates. Duplicates are omitted from the batch and reported as `skipped: { index, matchedSk }`.
4. THE Confirm_Import_Handler SHALL apply normalisation (`coding-standards.md`: `category` and `source` both `.trim().toLowerCase()`) before writing to the Ledger. The raw extracted values are NOT trusted.
5. THE Confirm_Import_Handler SHALL compute and write `categoryMonth` on every Ledger item.
6. THE Confirm_Import_Handler SHALL, for each accepted `reconciliationCandidate` in `acceptedReconciliationIds`:
   - Resolve the parent SK (from the Statement record or from the newly-imported Ledger entries).
   - For each child SK produced by this import that is scoped to the candidate, issue a `PutCommand` to `laskifin-Links` with the deterministic `sk = LINK#<enc(parentSk)>#<enc(childSk)>` (per `linking-layer-design.md`).
   - Log and continue on `ConditionalCheckFailedException` (duplicate link) — already-existing links are a success case.
7. THE Confirm_Import_Handler SHALL update the Statement record with `status = 'imported'`, `importedCount = <successfully written count>`, and clear `extractedTransactions` to reduce storage.
8. THE Confirm_Import_Handler SHALL return HTTP 200 with body `{ imported: number, skipped: [...], linked: number, linkFailed: [...] }`.
9. IF `selectedIndices` is empty, THE Confirm_Import_Handler SHALL return HTTP 400 with message `"No transactions selected"`.
10. IF any `selectedIndex` is out of bounds, THE Confirm_Import_Handler SHALL return HTTP 400.
11. THE Confirm_Import_Handler SHALL NOT partially fail. If the BatchWrite returns `UnprocessedItems`, THE handler SHALL retry up to 3 times with exponential backoff before giving up.
12. IF the Cognito sub claim is missing, THE Confirm_Import_Handler SHALL return HTTP 401.

### Requirement 8: List and Delete Statements

**User Story:** As a user, I want to see my past uploads and delete ones I no longer need.

#### Acceptance Criteria

1. WHEN the user sends `GET /statements`, THE Statements service SHALL return a paginated list of the user's Statement records sorted by `createdAt` descending. `extractedTransactions` is omitted from the list response — only metadata is returned.
2. WHEN the user sends `DELETE /statements/{statementId}`, THE Delete_Statement_Handler SHALL delete the S3 object at `s3Key` and the DDB record, returning HTTP 200.
3. Deleting a Statement SHALL NOT delete any Ledger entries that were imported from it, nor any Links created from it.
4. IF the Statement is in `status = 'processing'`, THE Delete_Statement_Handler SHALL return HTTP 409 with message `"Cannot delete a statement that is currently being processed"`.

### Requirement 9: API Gateway and CDK Infrastructure

**User Story:** As a developer, I want the feature wired through API Gateway and CDK with Cognito authorisation and least-privilege IAM, so that it is secure and deployable.

#### Acceptance Criteria

1. THE Statements API SHALL expose: `POST /statements`, `GET /statements`, `GET /statements/{statementId}`, `POST /statements/{statementId}/confirm`, `DELETE /statements/{statementId}`.
2. All routes SHALL require Cognito User Pool authorisation.
3. Each Lambda SHALL be a `NodejsFunction` with Node.js 22.x runtime, `minify: true`, `sourceMap: true`.
4. Memory and timeout SHALL be: 256 MB / 10 s for Init_Upload, Review, Delete; 512 MB / 90 s for Process_Statement (increased timeout to accommodate the LLM API call); 512 MB / 30 s for Confirm_Import.
5. A new S3 bucket `laskifin-statements` SHALL be created in the ApiStack (or a new `StatementsStack`) with `blockPublicAccess = ALL`, versioning enabled, CORS allowing the frontend origin for `PUT`, and a lifecycle rule to transition uploads older than 90 days to Glacier.
6. Process_Statement_Handler SHALL be subscribed to the bucket via `s3.EventType.OBJECT_CREATED` with a filter on key prefix `statements/`.
7. IAM grants per handler:
   - Init_Upload_Handler: `s3:PutObject` on `laskifin-statements/statements/*`, `dynamodb:PutItem` on `laskifin-Statements`.
   - Process_Statement_Handler: `s3:GetObject` on `laskifin-statements/statements/*`, `dynamodb:ReadWriteData` on `laskifin-Statements`, `dynamodb:Query` + `dynamodb:GetItem` on `laskifin-Ledger` (for reconciliation lookup), `secretsmanager:GetSecretValue` on `laski/anthropic-api-key` (for the Anthropic API key).
   - Review_Handler: `dynamodb:ReadData` on `laskifin-Statements`, `dynamodb:Query` on `laskifin-Ledger` (for duplicate detection).
   - Confirm_Import_Handler: `dynamodb:ReadWriteData` on `laskifin-Ledger`, `dynamodb:ReadWriteData` on `laskifin-Statements`, `dynamodb:ReadWriteData` on `laskifin-MonthlySummary`, `dynamodb:WriteData` on `laskifin-Links`.
   - Delete_Statement_Handler: `s3:DeleteObject` on `laskifin-statements/statements/*`, `dynamodb:ReadWriteData` on `laskifin-Statements`.
8. Environment variables per handler:
   - Init_Upload_Handler: `STATEMENTS_TABLE_NAME`, `STATEMENTS_BUCKET_NAME`.
   - Process_Statement_Handler: `STATEMENTS_TABLE_NAME`, `STATEMENTS_BUCKET_NAME`, `TABLE_NAME` (Ledger), `ANTHROPIC_SECRET_NAME` (the Secrets Manager secret name for the Anthropic API key, value `laski/anthropic-api-key`).
   - Review_Handler: `STATEMENTS_TABLE_NAME`, `TABLE_NAME`.
   - Confirm_Import_Handler: `STATEMENTS_TABLE_NAME`, `TABLE_NAME`, `SUMMARY_TABLE_NAME`, `LINKS_TABLE_NAME`.
   - Delete_Statement_Handler: `STATEMENTS_TABLE_NAME`, `STATEMENTS_BUCKET_NAME`.
9. The `laskifin-Statements` table SHALL be added to `DataStack` with the schema defined in `data-model.md` plus two GSIs: `GSI_StatementsByS3Key` (pk = `s3Key`) for the async processor, and `GSI_StatementsByDocumentTypeDueDate` (pk = `pk`, sk = `documentType#dueDate`) for reconciliation lookups.
10. The `laskifin-Ledger` table SHALL receive a new sparse GSI `GSI_LedgerByImportHash` (pk = `pk`, sk = `importHash`), projection = keys-only. Only items with an `importHash` attribute participate in the index.
11. All CDK assertion tests per `coding-standards.md` SHALL be added: routes exist with Cognito authoriser, Lambda memory/timeout/runtime are correct, env vars are set, IAM scopes match BR requirements.

### Requirement 10: Frontend — Statement Import Page

**User Story:** As a user, I want a clear UI flow to upload, review, and confirm a statement.

#### Acceptance Criteria

1. THE Statement_Import_Page SHALL be added at route `/statements/import` and be linked from the main navigation.
2. THE page SHALL display a two-step form: step 1 selects `documentType` and `bank`, step 2 drops the file. Upload uses the pre-signed URL returned by `POST /statements`.
3. WHILE the Statement has `status` in `{pending, processing}`, THE page SHALL poll `GET /statements/{statementId}` every 2 s (max 60 s) and show a progress indicator.
4. WHEN `status = 'done'`, THE page SHALL render the review table with: checkbox per row (all selected by default, duplicates unselected), editable `category` and `source` cells, and a summary bar showing total selected count, total amount, and any `ReconciliationCandidate` callouts.
5. WHEN a `ReconciliationCandidate` exists with `confidence = 'high'`, THE page SHALL show a banner: "We detected this bill was paid from your Itaú checking account on DD/MM/YYYY for R$ X. Link all N charges to the bank payment?" with a single accept button.
6. WHEN the user clicks "Confirm import", THE page SHALL `POST /statements/{statementId}/confirm` with `selectedIndices` and `acceptedReconciliationIds`, then navigate to the Transactions page with a success toast showing the per-row results (imported / skipped / linked / link-failed).
7. IF the upload pre-signed URL PUT fails (network, size-exceeded), THE page SHALL show an inline error and offer retry without losing the form state.
8. THE page SHALL gracefully handle `status = 'failed'` by showing the first error message from `errors[]` and offering to re-upload.

### Requirement 11: LLM Extraction Security and Cost

**User Story:** As a developer, I want the LLM-based extraction to be secure, cost-monitored, and resilient to transient failures, so that the feature is production-ready.

#### Acceptance Criteria

1. THE Process_Statement_Handler SHALL retrieve the Anthropic API key from AWS Secrets Manager at `laski/anthropic-api-key` using `@aws-sdk/client-secrets-manager`. The key SHALL be cached at module scope (cold-start cache) for the lifetime of the warm Lambda container, following the same pattern used by the AI advisor feature. The key SHALL never be logged, included in error messages, or written to DynamoDB.
2. THE LLM_Parser SHALL use the `@anthropic-ai/sdk` TypeScript package to call the Anthropic Messages API. The PDF SHALL be sent as a base64-encoded `document` content block (Anthropic's native PDF support). The model SHALL be `claude-sonnet-4-6` with `temperature: 0` for deterministic output.
3. THE LLM_Parser SHALL validate the API response against the `ExtractedTransaction[]` Zod schema. Every field required by BR-S9 (`date`, `description`, `amount`, `type`, `source`, `category`) SHALL be validated.
4. IF the LLM returns invalid JSON or the response fails Zod validation, THE LLM_Parser SHALL retry once with a more explicit prompt that includes the Zod error details and a stricter JSON schema example. IF the retry also fails validation, THE parser SHALL throw with a descriptive error and Process_Statement_Handler SHALL set `status = 'failed'`.
5. THE LLM_Parser SHALL log token usage (input tokens, output tokens) per extraction call to CloudWatch via structured logging (console.log with JSON). This enables cost tracking per extraction via CloudWatch Metrics filters.
6. WHILE the Anthropic API is unavailable or returns a 5xx error, THE LLM_Parser SHALL retry up to 2 times with exponential backoff (1 s, 2 s) before throwing. Client-side errors (4xx other than 429) SHALL NOT be retried.
7. THE LLM prompt SHALL NOT include any user-identifying information beyond what is in the PDF itself. The `userId` (Cognito sub) SHALL NOT be sent to the Anthropic API.

## Correctness Properties (for property-based tests)

Per `coding-standards.md`, every feature spec defines universal correctness properties. Each is implemented as one `fast-check` property test with ≥ 100 iterations.

- **P-SI-1 (Conservation of amount)**: For any credit card `ParseResult` where `totalAmount` is present, `Math.abs(sum(parseResult.extractedTransactions.amount) - parseResult.totalAmount) < 0.01`. This property is tested by generating synthetic `ParseResult` objects with known `totalAmount` and verifying the conservation check logic, independent of the LLM call.
- **P-SI-2 (No balance rows)**: For any `ParseResult` from a bank account extraction, `parseResult.extractedTransactions.map(t => t.description)` contains no value matching `SALDO ANTERIOR|SALDO TOTAL DISPONÍVEL DIA`. This property is tested by generating synthetic `ExtractedTransaction[]` arrays and verifying the post-extraction validation filter rejects balance-line descriptions.
- **P-SI-3 (Import idempotency)**: For any extracted transaction list `X` and its `importHash`es, running `confirmImport(X)` twice yields the same number of Ledger entries on the second run as on the first run plus zero new entries (all second-run items are `skipped`).
- **P-SI-4 (Reconciliation exactness)**: For any synthetic pair `(bankStmt, cardStmt)` where `bankStmt` contains exactly one row matching the Itaú bill-payment pattern whose `amount == cardStmt.totalDestaFatura`, the reconciliation service produces exactly one `ReconciliationCandidate` with `confidence = 'high'`.
- **P-SI-5 (Link count)**: If the user accepts a high-confidence reconciliation with `childCount = N`, the Links table gains exactly `N` new items scoped to that user (idempotent re-import does not grow the count).
- **P-SI-6 (User isolation)**: For any two users `U1`, `U2` and any statement uploaded by `U1`, `U2` cannot read the Statement record, the S3 object, or any extracted transaction — all five API endpoints return 404 when called with `U2`'s identity.
