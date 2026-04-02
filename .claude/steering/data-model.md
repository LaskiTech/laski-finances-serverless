---
inclusion: always
---

# LASKI Finances — Data Model

## Overview

DynamoDB is the primary data store. The architecture uses multiple tables per domain rather than a strict single-table design — new features may introduce additional tables as needed. All tables are managed in `DataStack` and exported as cross-stack references for use in `ApiStack` Lambda functions.

All attribute names are in English. Legacy Portuguese field names must be migrated on read/write as encountered.

---

## Tables

### Table 1 — `laskifin-Ledger`

**Status**: Exists in production. Shared by all transaction types (expenses and income).

**Billing**: PAY_PER_REQUEST. Point-in-time recovery enabled.

| Attribute | Type | Example | Notes |
|-----------|------|---------|-------|
| `pk` | String | `USER#a1b2c3` | Partition key. Cognito sub extracted from authorizer claims. |
| `sk` | String | `TRANS#2024-06#EXP#uuid` | Sort key. Encodes month + type for range queries. |
| `description` | String | `Groceries (1/3)` | Suffixed with `(i/N)` for installment entries. |
| `amount` | Number | `333.33` | Per-entry amount. Equals `totalAmount / installments`. |
| `totalAmount` | Number | `1000.00` | Original purchase amount. Preserved on all installment entries. |
| `type` | String | `EXP` | `"INC"` or `"EXP"`. Encoded in SK. |
| `category` | String | `Food` | Free-text. User-defined. Used in GSI SK composite. |
| `source` | String | `Nubank` | Payment account or income source. Free-text. |
| `date` | String | `2024-06-15` | ISO 8601 date. Drives the `YYYY-MM` segment of SK. |
| `groupId` | String | `uuid-v4` | UUID shared across all entries of the same installment or recurrence group. |
| `installmentNumber` | Number | `1` | 1-based index. Always `1` for non-installment entries. |
| `installmentTotal` | Number | `3` | Total installments. Always `1` for non-installment entries. |
| `isRecurring` | Boolean | `true` | Marks recurring income entries. Omitted (falsy) for non-recurring. |
| `recurringId` | String | `uuid-v4` | Groups all entries of the same recurrence series. Omitted for non-recurring. |
| `categoryMonth` | String | `Food#2024-06` | Composite GSI SK. Written at Lambda time as `category + "#" + YYYY-MM`. |
| `createdAt` | String | `2024-06-01T10:00:00Z` | ISO 8601 timestamp. Set on creation, never updated. |

#### Sort Key Pattern

```
TRANS#<YYYY-MM>#<INC|EXP>#<uuid>
```

The sort key encodes month and type, enabling `begins_with` queries at three levels of specificity:

| SK prefix | Matches |
|-----------|---------|
| `TRANS#` | All transactions for user |
| `TRANS#2024-06#` | All transactions in June 2024 |
| `TRANS#2024-06#EXP#` | All expenses in June 2024 |

#### GSIs on `laskifin-Ledger`

| Index | PK | SK | Purpose | Status |
|-------|----|----|---------|--------|
| `GSI_LookupBySource` | `source` | — | All transactions for a given source/account | Exists |
| `GSI_MonthlyByCategory` | `pk` | `categoryMonth` | Top spending by category per month; category filter | New — add to DataStack |

**GSI_MonthlyByCategory**: requires the `categoryMonth` composite attribute (e.g. `Food#2024-06`) to be written on every Ledger item at creation and updated on category or date changes. All create/update handlers are responsible for maintaining this attribute.

---

### Table 2 — `laskifin-MonthlySummary`

**Status**: New. Add to `DataStack`.

**Purpose**: Pre-aggregated monthly totals per user. Enables O(1) balance overview reads regardless of transaction volume. Updated atomically on every Ledger write using DynamoDB `ADD` expressions.

**Billing**: PAY_PER_REQUEST. Point-in-time recovery enabled.

| Attribute | Type | Example | Notes |
|-----------|------|---------|-------|
| `pk` | String | `USER#a1b2c3` | Partition key. Same pattern as Ledger. |
| `sk` | String | `SUMMARY#2024-06` | Sort key. One item per user per month. |
| `totalIncome` | Number | `5000.00` | Sum of all `INC` amounts written in this month. |
| `totalExpenses` | Number | `3200.50` | Sum of all `EXP` amounts written in this month. |
| `balance` | Number | `1799.50` | Denormalized: `totalIncome - totalExpenses`. Updated on every write. |
| `transactionCount` | Number | `24` | Total entries written in this month. |
| `updatedAt` | String | `2024-06-15T10:00:00Z` | ISO 8601 timestamp of last write. |

#### Update Strategy

Every Lambda handler that writes to `laskifin-Ledger` must also update `laskifin-MonthlySummary` atomically in the same operation:

- **Create**: `ADD totalIncome :amount` or `ADD totalExpenses :amount`, `ADD transactionCount :one`, `SET balance = totalIncome - totalExpenses`, `SET updatedAt = :now`.
- **Delete**: Subtract the deleted item's amount using `ADD totalExpenses -:amount` (negative ADD).
- **Update**: Subtract old amount, add new amount in a single `UpdateCommand`.
- **Import (statement)**: Apply the same ADD pattern per imported entry inside the BatchWrite loop.

Use `attribute_not_exists(pk)` with `SET totalIncome = if_not_exists(totalIncome, :zero) + :amount` to safely initialise a new month's summary item on first write.

---

### Table 3 — `laskifin-Statements`

**Status**: New. Add to `DataStack` when implementing the statement upload feature.

**Purpose**: Tracks the lifecycle of uploaded bank statements — from upload through parsing to import.

**Billing**: PAY_PER_REQUEST. Point-in-time recovery enabled.

| Attribute | Type | Example | Notes |
|-----------|------|---------|-------|
| `pk` | String | `USER#a1b2c3` | Partition key. |
| `sk` | String | `STATEMENT#uuid` | Sort key. |
| `statementId` | String | `uuid-v4` | Matches SK suffix. Returned to frontend. |
| `filename` | String | `statement-jun.pdf` | Original filename from upload request. |
| `contentType` | String | `application/pdf` | `application/pdf` or `text/csv`. |
| `s3Key` | String | `statements/user/uuid.pdf` | S3 object key. |
| `status` | String | `processing` | `pending` \| `processing` \| `done` \| `failed`. |
| `extractedCount` | Number | `18` | Number of transactions extracted. Set when status = `done`. |
| `importedCount` | Number | `16` | Number of transactions confirmed by user. Set after import. |
| `errors` | List | `[]` | Parsing error messages. |
| `extractedTransactions` | List | `[...]` | Temp storage of parsed rows before user confirmation. Cleared after import. |
| `createdAt` | String | `2024-06-01T10:00:00Z` | Upload initiation timestamp. |
| `updatedAt` | String | `2024-06-01T10:05:00Z` | Last status change timestamp. |

---

## Access Patterns

Listed in priority order (from feature gap analysis).

| Priority | Pattern | Table / Index | Key Condition | Notes |
|----------|---------|---------------|---------------|-------|
| 1 | All transactions for user | Ledger | `pk = USER#sub`, `sk begins_with TRANS#` | List all |
| 2 | Transactions by month | Ledger | `pk = USER#sub`, `sk begins_with TRANS#YYYY-MM#` | Month filter |
| 3 | Transactions by month + type | Ledger | `pk = USER#sub`, `sk begins_with TRANS#YYYY-MM#EXP#` | Month + type filter |
| 4 | Single transaction | Ledger | `pk = USER#sub`, `sk = TRANS#...` | Get / Update / Delete |
| 5 | Transactions by category (month) | GSI_MonthlyByCategory | `pk = USER#sub`, `sk begins_with Food#YYYY-MM` | Requires `categoryMonth` attribute |
| 6 | Transactions by source | GSI_LookupBySource | `source = Nubank` | Filtered to user via FilterExpression |
| 7 | Monthly balance (single month) | MonthlySummary | `pk = USER#sub`, `sk = SUMMARY#YYYY-MM` | GetItem — O(1) |
| 8 | Monthly balance (range) | MonthlySummary | `pk = USER#sub`, `sk between SUMMARY#from and SUMMARY#to` | Query — one item per month |
| 9 | Top spending by category | GSI_MonthlyByCategory | `pk = USER#sub`, all items for month | Aggregate + sort in Lambda |
| 10 | Top income sources | GSI_LookupBySource | `source = X`, `type = INC` | FilterExpression on type + month |
| 11 | Statement lifecycle | Statements | `pk = USER#sub`, `sk = STATEMENT#uuid` | GetItem for status polling |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single `laskifin-Ledger` table for both INC and EXP | The SK encodes type — filtering is free via `begins_with`. Splitting by type adds operational overhead with no query benefit. |
| Separate `laskifin-MonthlySummary` table | Computing balance by scanning all Ledger entries on every dashboard load is expensive. Pre-aggregation with `ADD` expressions is O(1) per write and O(1) per read. |
| `categoryMonth` composite attribute for GSI SK | DynamoDB cannot do range queries on non-key attributes. Encoding `category + "#" + YYYY-MM` in a single SK enables efficient per-category-per-month slices without a scan. |
| Free-text `category` and `source` | Fastest to ship. Controlled vocabulary via a lookup table is a follow-up improvement — requires only API validation changes, no data migration. |
| No GSI for installment group delete | Group delete queries by `groupId` using `FilterExpression` on a partition scan. Installment groups are small (≤ 48 items maximum) so this is acceptable — a dedicated GSI would be over-engineering. |
| `recurringId` mirrors `groupId` pattern | Recurring income follows the same group identity pattern as installments: a shared UUID links all entries of the same series. `updateGroup` and `deleteGroup` operations on future entries follow the same BatchWrite pattern as installment group delete. |

---

## DataStack CDK Changes Required

The following changes must be made to `infra/lib/data-stack.ts`:

1. **Add `GSI_MonthlyByCategory`** to the existing `laskifin-Ledger` table definition:
   ```typescript
   ledgerTable.addGlobalSecondaryIndex({
     indexName: 'GSI_MonthlyByCategory',
     partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
     sortKey: { name: 'categoryMonth', type: dynamodb.AttributeType.STRING },
     projectionType: dynamodb.ProjectionType.ALL,
   });
   ```

2. **Create `laskifin-MonthlySummary` table**:
   ```typescript
   const summaryTable = new dynamodb.Table(this, 'MonthlySummaryTable', {
     tableName: 'laskifin-MonthlySummary',
     partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
     sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
     billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
     pointInTimeRecovery: true,
   });
   ```

3. **Export `summaryTableName` and `summaryTableArn`** via `CfnOutput` for use in `ApiStack`.

4. **Create `laskifin-Statements` table** when implementing the statement upload feature (defer until that feature is specced).
