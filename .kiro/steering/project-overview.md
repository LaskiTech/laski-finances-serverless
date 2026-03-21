---
inclusion: always
---

# LASKI Finances — Project Overview

## Vision

A personal finance management platform that gives users a clear view of their financial health by comparing income and expenses. Transactions can be recorded manually via the web interface or automatically by uploading bank statements and similar documents (text extraction to identify relevant business data).

## Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| Login | Cognito-based authentication (email + password) | Infra ready |
| Expense Tracking | Record and categorize expenses, with installment support | Lambda exists (needs API Gateway) |
| Income Tracking | Record income entries tied to sources | Not started |
| Data Queries | Filter/search transactions by month, type, source, category | Not started |
| Balance Overview | Monthly summary comparing total income vs total expenses | Not started |
| Top Spending Insights | Highlight top categories and sources by spend amount | Not started |
| Statement Upload | Upload bank statements (PDF/CSV), extract transactions via text processing | Not started |

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

### Balance & Insights
- **BR8**: Balance overview = sum of INC - sum of EXP for a given period (month or custom range)
- **BR9**: Top spending insights rank categories and sources by total EXP amount in a period
- **BR10**: Balance and insights are computed on-read (no pre-aggregated data for now)

### Statement Upload
- **BR11**: Supported formats: PDF and CSV bank statements
- **BR12**: Uploaded files are stored in S3, then processed asynchronously
- **BR13**: Text extraction identifies: date, description, amount, and type (INC/EXP) from each line
- **BR14**: Extracted transactions are created as draft entries for user review before confirmation
