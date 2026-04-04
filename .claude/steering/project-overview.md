---
inclusion: always
---

# LASKI Finances — Project Overview

## Vision

A personal finance management platform that gives users a clear view of their financial health by comparing income and expenses. Transactions can be recorded manually via the web interface or automatically by uploading bank statements and similar documents (text extraction to identify relevant business data).

## Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| Login | Cognito-based authentication (email + password + Google federated) | Specced — ready for Claude Code |
| Expense Tracking | Record and categorize expenses, with installment support | Backend deployed — frontend specced |
| Income Tracking | Record income entries tied to sources, with recurrence support | Specced — ready for Claude Code |
| Data Queries | Filter/search transactions by month, type, source, category | Covered by income + expense list endpoints |
| Balance Overview | Monthly summary reading from pre-aggregated MonthlySummary table | Specced — ready for Claude Code |
| Top Spending Insights | Ranked categories and sources by spend/income amount | Specced — ready for Claude Code |
| AI Financial Advisor | Conversational advisor powered by Claude, grounded in user data | Specced — ready for Claude Code |
| Statement Upload | Upload bank statements (PDF/CSV), extract transactions via text processing | Not started — build last |

## Business Domain

The core domain is **ledger-based transaction tracking** with support for:

- **Transactions**: Every financial event is a ledger entry, either income (INC) or expense (EXP)
- **Installments**: A single purchase can be split into N monthly installments, grouped by a `groupId`. Each installment entry carries `installmentNumber`, `installmentTotal`, and `totalAmount` for self-contained context
- **Payment Sources**: Each transaction is tied to a source — credit cards (Nubank, XP), bank accounts, cash, etc.
- **Categories**: Both expenses and income are categorized for analysis
  - Expense categories: Food, Transport, Leisure, Health, Housing, Education, etc.
  - Income categories: Salary, Gift, Investment Return, Freelance, Other
- **Temporal Analysis**: Financial flow is analyzed by month (YYYY-MM), enabling monthly summaries and projections
- **Statement Import**: Bank statements are uploaded and parsed to automatically create transaction entries

### Domain Language (English)

All code, field names, and API contracts use English. Below is the canonical mapping from the legacy Portuguese terms to the current English standard:

| English (current) | Portuguese (legacy) | DynamoDB Attribute |
|--------------------|--------------------|--------------------|
| Transaction | Transação | — |
| Income (INC) | Receita (REC) | `type: "INC"` |
| Expense (EXP) | Despesa (DESP) | `type: "EXP"` |
| Installment | Parcela | — |
| Installment Number | — | `installmentNumber` |
| Installment Total | — | `installmentTotal` |
| Source | Fonte | `source` |
| Category | Categoria | `category` |
| Amount | Valor | `amount` |
| Total Amount | Valor Total | `totalAmount` |
| Description | Descrição | `description` |
| Date | Data | `date` |
| Group ID | — | `groupId` |

## Users

- Single-user personal finance tool (multi-tenant by Cognito user ID)
- Each user's data is fully isolated via `USER#<cognitoSub>` partition key

## Key Business Rules

### Transactions
- **BR1**: Every transaction must have: description, amount, date, type (INC/EXP), source, category
- **BR2**: Installments split `totalAmount` equally across N months, each as a separate ledger entry
- **BR3**: Installment descriptions are suffixed with `(i/N)` format
- **BR4**: All installments in a purchase share the same `groupId`
- **BR5**: Each installment entry must include: `groupId`, `installmentNumber` (1-based), `installmentTotal` (N), and `totalAmount` (original purchase amount) — enabling full context from any single entry without extra queries
- **BR6**: Transactions can be queried by source via GSI (`GSI_LookupBySource`)
- **BR7**: User data isolation is enforced by Cognito sub claim in the partition key
- **BR8**: `category` and `source` are normalised to lowercase and trimmed before being written to DynamoDB — the raw user input is never stored directly

### Balance & Insights
- **BR9**: Balance overview = `totalIncome - totalExpenses` for a given period, read from the pre-aggregated `laskifin-MonthlySummary` table. The handler never scans `laskifin-Ledger` for balance computation.
- **BR10**: Every handler that writes to `laskifin-Ledger` must atomically update `laskifin-MonthlySummary` using the shared `updateMonthlySummary()` utility. This is a non-optional side effect — skipping it silently corrupts the balance.
- **BR11**: The stored `balance` attribute on `laskifin-MonthlySummary` items is not used for reads. Handlers always compute `balance = totalIncome - totalExpenses` from the freshly read fields to avoid race condition artefacts.
- **BR12**: Top spending insights rank expense categories by `amount` total, computed in Lambda by querying `GSI_MonthlyByCategory`. Top sources rank income sources by `amount` total, computed in Lambda by querying the Ledger with SK prefix `TRANS#YYYY-MM#INC#`.

### Statement Upload
- **BR13**: Supported formats: PDF and CSV bank statements
- **BR14**: Uploaded files are stored in S3, then processed asynchronously
- **BR15**: Text extraction identifies: date, description, amount, and type (INC/EXP) from each line
- **BR16**: Extracted transactions are created as draft entries for user review before confirmation
