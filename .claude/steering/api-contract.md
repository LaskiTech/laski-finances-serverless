---
inclusion: auto
---

# LASKI Finances — API Contract

## Overview

REST API built on API Gateway (v1) with a Cognito User Pool Authorizer on every route. All endpoints require a valid Cognito ID token in the `Authorization` header. The API base URL is injected into the frontend via `VITE_API_URL`.

All Lambda handlers follow the conventions in `coding-standards.md`: one file per operation, `APIGatewayProxyEvent` → `APIGatewayProxyResult`, `userId` extracted from `event.requestContext.authorizer?.claims.sub`, Zod validation, structured error responses.

---

## Common Error Responses

All handlers return consistent error shapes:

| Scenario | Status | Body |
|----------|--------|------|
| Missing Cognito sub claim | 401 | `{ "error": "Unauthorized" }` |
| Invalid / missing JSON body | 400 | `{ "error": "Invalid request body" }` |
| Zod validation failure | 400 | `{ "error": "Validation failed", "details": ["..."] }` |
| Item not found | 404 | `{ "error": "<Resource> not found" }` |
| DynamoDB ConditionalCheckFailedException | 404 | `{ "error": "<Resource> not found" }` |
| Unexpected error | 500 | `{ "error": "Internal server error" }` |

---

## Transactions — `/transactions`

**Status**: All five endpoints exist and are deployed.

### POST `/transactions`

Creates one or more transaction entries (single or installment split).

**Lambda**: `create-transaction.ts`
**DynamoDB**: `PutCommand` (single) or `BatchWriteCommand` (installments)
**IAM**: `grantWriteData`

**Request body**:
```json
{
  "description": "Groceries",
  "totalAmount": 300.00,
  "date": "2024-06-15",
  "type": "EXP",
  "source": "Nubank",
  "category": "Food",
  "installments": 3
}
```

- `installments` is optional. Defaults to `1`.
- When `installments > 1`: creates N entries with shared `groupId`, sequential `installmentNumber`, date offset by month, description suffixed with `(i/N)`, `amount = totalAmount / N`.
- When `installments = 1`: creates one entry with `amount = totalAmount`, `installmentNumber = 1`, `installmentTotal = 1`.
- Handler must also: write `categoryMonth` attribute (`category + "#" + YYYY-MM`), and apply `ADD` update to `laskifin-MonthlySummary`.

**Response 201**:
```json
{ "message": "Transaction created" }
```

---

### GET `/transactions`

Lists transactions for the authenticated user with optional filters.

**Lambda**: `list-transactions.ts`
**DynamoDB**: `QueryCommand` on `laskifin-Ledger`
**IAM**: `grantReadData`

**Query parameters**:

| Param | Type | Example | Notes |
|-------|------|---------|-------|
| `month` | String | `2024-06` | Filters by YYYY-MM in SK |
| `type` | String | `EXP` | `INC` or `EXP`. Combined with `month` if provided. |

SK prefix is built dynamically: `TRANS#` → `TRANS#2024-06#` → `TRANS#2024-06#EXP#`.
Results sorted descending (`ScanIndexForward: false`).

**Response 200**:
```json
{
  "transactions": [
    {
      "pk": "USER#sub",
      "sk": "TRANS#2024-06#EXP#uuid",
      "description": "Groceries (1/3)",
      "amount": 100.00,
      "totalAmount": 300.00,
      "type": "EXP",
      "category": "Food",
      "source": "Nubank",
      "date": "2024-06-15",
      "groupId": "uuid",
      "installmentNumber": 1,
      "installmentTotal": 3,
      "createdAt": "2024-06-01T10:00:00Z"
    }
  ]
}
```

---

### GET `/transactions/{sk}`

Retrieves a single transaction by sort key.

**Lambda**: `get-transaction.ts`
**DynamoDB**: `GetCommand`
**IAM**: `grantReadData`

**Response 200**: Full `TransactionItem` object. **404** if not found.

---

### PUT `/transactions/{sk}`

Updates a single transaction entry (never the full installment group).

**Lambda**: `update-transaction.ts`
**DynamoDB**: `UpdateCommand` with `ConditionExpression: "attribute_exists(pk)"`
**IAM**: `grantReadWriteData`

**Request body**:
```json
{
  "description": "Groceries updated",
  "amount": 120.00,
  "date": "2024-06-15",
  "type": "EXP",
  "source": "Nubank",
  "category": "Food"
}
```

Updatable fields: `description`, `amount`, `date`, `type`, `source`, `category`.
Handler must also: recalculate and update `categoryMonth`, adjust `laskifin-MonthlySummary` (subtract old amount, add new amount).

**Response 200**: Updated `TransactionItem`. **404** if not found.

---

### DELETE `/transactions/{sk}`

Deletes one transaction or a full installment group.

**Lambda**: `delete-transaction.ts`
**DynamoDB**: `DeleteCommand` (single) or `BatchWriteCommand` (group)
**IAM**: `grantReadWriteData`

**Query parameters**:

| Param | Default | Behaviour |
|-------|---------|-----------|
| `deleteGroup=false` | default | Deletes only the item at `{sk}` |
| `deleteGroup=true` | — | Gets item's `groupId`, queries all siblings, BatchWrite deletes all |

Handler must also: apply negative `ADD` to `laskifin-MonthlySummary` for each deleted entry.

**Response 200**: `{ "message": "Transaction deleted" }` or `{ "message": "Group deleted", "count": 3 }`. **404** if not found.

---

## Income — `/income`

**Status**: New. All four endpoints to be implemented.

Income entries share `laskifin-Ledger` with `type = "INC"`. The `/income` resource adds recurrence management on top of the shared table.

### POST `/income`

Creates one income entry (one-time) or a series of recurring entries.

**Lambda**: `create-income.ts`
**DynamoDB**: `PutCommand` (one-time) or `BatchWriteCommand` (recurring)
**IAM**: `grantWriteData` on Ledger + `grantWriteData` on MonthlySummary

**Request body**:
```json
{
  "description": "Salary",
  "totalAmount": 5000.00,
  "date": "2024-06-01",
  "source": "Employer",
  "category": "Salary",
  "recurrence": {
    "frequency": "monthly",
    "endDate": "2024-12-01"
  }
}
```

- `recurrence` is optional. Omit for one-time income.
- `frequency`: `"monthly"` or `"weekly"`.
- `endDate`: ISO date of last entry. Alternatively use `occurrences: N`.
- When `recurrence` is provided: generates N entries sharing a `recurringId`, `isRecurring: true`, each dated at the correct offset.
- Each entry gets `type: "INC"`, `installmentNumber: 1`, `installmentTotal: 1`, `groupId` = `recurringId`.
- Handler must write `categoryMonth` and apply `ADD` to `laskifin-MonthlySummary` per entry.

**Response 201**:
```json
{
  "message": "Income created",
  "recurringId": "uuid",
  "entriesCreated": 6
}
```

---

### GET `/income`

Lists income entries for the authenticated user.

**Lambda**: `list-income.ts`
**DynamoDB**: `QueryCommand` — `pk = USER#sub`, `sk begins_with TRANS#[month]#INC#`
**IAM**: `grantReadData`

**Query parameters**:

| Param | Type | Notes |
|-------|------|-------|
| `month` | String YYYY-MM | Filter by month |
| `recurring` | Boolean | If `true`, return only entries with `isRecurring = true` |

**Response 200**:
```json
{
  "income": [
    {
      "sk": "TRANS#2024-06#INC#uuid",
      "description": "Salary",
      "amount": 5000.00,
      "source": "Employer",
      "category": "Salary",
      "date": "2024-06-01",
      "isRecurring": true,
      "recurringId": "uuid",
      "createdAt": "2024-06-01T10:00:00Z"
    }
  ]
}
```

---

### PUT `/income/{sk}`

Updates one income entry or all future entries in a recurrence series.

**Lambda**: `update-income.ts`
**DynamoDB**: `UpdateCommand` (single) or `BatchWriteCommand` (future group)
**IAM**: `grantReadWriteData`

**Query parameters**:

| Param | Default | Behaviour |
|-------|---------|-----------|
| `updateGroup=false` | default | Updates only this entry |
| `updateGroup=true` | — | Updates all entries sharing `recurringId` with `date >= this entry's date` (future-only) |

**Request body**: same fields as create minus `recurrence`.

Handler must recalculate `categoryMonth` and adjust `laskifin-MonthlySummary` for each updated entry.

**Response 200**: Updated income item(s).

---

### DELETE `/income/{sk}`

Deletes one income entry or all future entries in a recurrence series.

**Lambda**: `delete-income.ts`
**DynamoDB**: `DeleteCommand` or `BatchWriteCommand`
**IAM**: `grantReadWriteData`

**Query parameters**:

| Param | Default | Behaviour |
|-------|---------|-----------|
| `deleteGroup=false` | default | Deletes only this entry |
| `deleteGroup=true` | — | Deletes all entries sharing `recurringId` with `date >= this entry's date` (future-only) |

Handler must apply negative `ADD` to `laskifin-MonthlySummary` for each deleted entry.

**Response 200**: `{ "message": "Income deleted" }` or `{ "message": "Recurrence deleted", "count": 6 }`.

---

## Balance — `/balance`

**Status**: New. One endpoint to be implemented.

Reads from `laskifin-MonthlySummary`. Never scans `laskifin-Ledger`.

### GET `/balance`

Returns the monthly balance summary for the authenticated user.

**Lambda**: `get-balance.ts`
**DynamoDB**: `GetCommand` (single month) or `QueryCommand` (range) on `laskifin-MonthlySummary`
**IAM**: `grantReadData` on MonthlySummary

**Query parameters**:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `month` | String YYYY-MM | Current month | Single-month lookup. Mutually exclusive with `from`/`to`. |
| `from` | String YYYY-MM | — | Start of custom range. Requires `to`. |
| `to` | String YYYY-MM | — | End of custom range. Requires `from`. |

**Response 200 — single month** (`?month=2024-06` or no params):
```json
{
  "month": "2024-06",
  "totalIncome": 5000.00,
  "totalExpenses": 3200.50,
  "balance": 1799.50,
  "transactionCount": 24
}
```

**Response 200 — custom range** (`?from=2024-01&to=2024-06`):
```json
{
  "from": "2024-01",
  "to": "2024-06",
  "months": [
    { "month": "2024-01", "totalIncome": 5000.00, "totalExpenses": 2800.00, "balance": 2200.00, "transactionCount": 20 },
    { "month": "2024-02", "totalIncome": 5000.00, "totalExpenses": 3100.00, "balance": 1900.00, "transactionCount": 22 }
  ],
  "totals": {
    "totalIncome": 30000.00,
    "totalExpenses": 18600.00,
    "balance": 11400.00
  }
}
```

---

## Insights — `/insights`

**Status**: New. Two endpoints to be implemented.

### GET `/insights/top-spending`

Returns the top expense categories ranked by total amount for a given month.

**Lambda**: `top-spending.ts`
**DynamoDB**: `QueryCommand` on `GSI_MonthlyByCategory`
**IAM**: `grantReadData` on Ledger (GSI)

**Query parameters**:

| Param | Type | Default |
|-------|------|---------|
| `month` | String YYYY-MM | Current month |
| `limit` | Number | `5` |

Handler queries `GSI_MonthlyByCategory` with `pk = USER#sub` and `categoryMonth begins_with *#YYYY-MM`, aggregates `amount` per category in memory, sorts descending, slices to `limit`.

**Response 200**:
```json
{
  "month": "2024-06",
  "categories": [
    { "category": "Food",      "total": 1200.00, "share": 0.375 },
    { "category": "Transport", "total":  800.00, "share": 0.250 },
    { "category": "Health",    "total":  600.00, "share": 0.188 }
  ],
  "totalExpenses": 3200.00
}
```

`share` = `category.total / totalExpenses`. Drives progress bars on the dashboard without a second API call.

---

### GET `/insights/top-sources`

Returns the top income sources ranked by total amount for a given month.

**Lambda**: `top-sources.ts`
**DynamoDB**: `QueryCommand` on `laskifin-Ledger` (main table) with `pk = USER#sub` and `sk begins_with TRANS#YYYY-MM#INC#`
**IAM**: `grantReadData` on Ledger (GSI)

**Query parameters**:

| Param | Type | Default |
|-------|------|---------|
| `month` | String YYYY-MM | Current month |
| `limit` | Number | `5` |

**Response 200**:
```json
{
  "month": "2024-06",
  "sources": [
    { "source": "Employer", "total": 5000.00, "share": 1.0 }
  ],
  "totalIncome": 5000.00
}
```

---

## Statements — `/statements`

**Status**: New. Four endpoints to be implemented. Build after all other features are complete.

### POST `/statements/upload-url`

Returns a presigned S3 URL for direct browser-to-S3 upload. File bytes never pass through API Gateway.

**Lambda**: `get-upload-url.ts`
**AWS**: `s3.getSignedUrl('putObject')`, writes initial item to `laskifin-Statements`
**IAM**: S3 presign permission

**Request body**:
```json
{
  "filename": "statement-jun.pdf",
  "contentType": "application/pdf"
}
```

`contentType` must be `"application/pdf"` or `"text/csv"`. Reject all others with 400.

**Response 200**:
```json
{
  "uploadUrl": "https://s3.amazonaws.com/...",
  "statementId": "uuid",
  "expiresIn": 300
}
```

Frontend PUTs the file to `uploadUrl`. S3 event notification triggers the parsing Lambda automatically.

---

### GET `/statements/{statementId}/status`

Polls the processing status of an uploaded statement.

**Lambda**: `get-statement-status.ts`
**DynamoDB**: `GetCommand` on `laskifin-Statements`
**IAM**: `grantReadData` on Statements

**Response 200**:
```json
{
  "statementId": "uuid",
  "status": "processing",
  "extractedCount": 18,
  "errors": []
}
```

`status` values: `"pending"` → `"processing"` → `"done"` | `"failed"`.

---

### GET `/statements/{statementId}/preview`

Returns the extracted transactions for user review before import.

**Lambda**: `get-statement-preview.ts`
**DynamoDB**: `GetCommand` on `laskifin-Statements` (reads `extractedTransactions` list)
**IAM**: `grantReadData` on Statements

**Response 200**:
```json
{
  "statementId": "uuid",
  "transactions": [
    {
      "tempId": "t1",
      "description": "Mercado Livre",
      "amount": 149.90,
      "date": "2024-06-12",
      "type": "EXP",
      "category": "Shopping",
      "source": "Nubank",
      "confidence": 0.91
    }
  ]
}
```

`confidence` (0–1) is the parser's confidence score. Frontend highlights low-confidence rows for user review.

---

### POST `/statements/{statementId}/import`

Confirms and imports selected transactions into `laskifin-Ledger`.

**Lambda**: `import-statement.ts`
**DynamoDB**: `BatchWriteCommand` on Ledger + `ADD` updates on MonthlySummary
**IAM**: `grantWriteData` on Ledger + MonthlySummary

**Request body**:
```json
{
  "transactions": [
    {
      "tempId": "t1",
      "category": "Marketplace",
      "type": "EXP"
    }
  ]
}
```

User may override any field per row. Rows omitted from the array are skipped (not imported). Handler applies the same `categoryMonth` and MonthlySummary update logic as `create-transaction`.

**Response 201**:
```json
{
  "imported": 16,
  "skipped": 2
}
```

---

## Full Endpoint Summary

| Method | Path | Lambda | Table / Index | Status |
|--------|------|--------|---------------|--------|
| POST | `/transactions` | `create-transaction` | Ledger + MonthlySummary | Exists |
| GET | `/transactions` | `list-transactions` | Ledger | Exists |
| GET | `/transactions/{sk}` | `get-transaction` | Ledger | Exists |
| PUT | `/transactions/{sk}` | `update-transaction` | Ledger + MonthlySummary | Exists |
| DELETE | `/transactions/{sk}` | `delete-transaction` | Ledger + MonthlySummary | Exists |
| POST | `/income` | `create-income` | Ledger + MonthlySummary | New |
| GET | `/income` | `list-income` | Ledger | New |
| PUT | `/income/{sk}` | `update-income` | Ledger + MonthlySummary | New |
| DELETE | `/income/{sk}` | `delete-income` | Ledger + MonthlySummary | New |
| GET | `/balance` | `get-balance` | MonthlySummary | New |
| GET | `/insights/top-spending` | `top-spending` | Ledger (GSI_MonthlyByCategory) | New |
| GET | `/insights/top-sources` | `top-sources` | Ledger (main table, SK prefix) | New |
| POST | `/statements/upload-url` | `get-upload-url` | Statements + S3 | New |
| GET | `/statements/{id}/status` | `get-statement-status` | Statements | New |
| GET | `/statements/{id}/preview` | `get-statement-preview` | Statements | New |
| POST | `/statements/{id}/import` | `import-statement` | Ledger + MonthlySummary | New |

---

## ApiStack CDK Changes Required

All new Lambda functions follow the same pattern as existing handlers in `api-stack.ts`:

```typescript
const handler = new NodejsFunction(this, 'HandlerName', {
  entry: path.resolve(__dirname, '../../back/lambdas/src/<domain>/<action>.ts'),
  runtime: Runtime.NODEJS_22_X,
  memorySize: 256,
  timeout: Duration.seconds(10),
  bundling: { minify: true, sourceMap: true },
  environment: {
    TABLE_NAME: props.ledgerTableName,
    SUMMARY_TABLE_NAME: props.summaryTableName,
  },
});
```

New API Gateway resources to add:

- `/income` resource with POST, GET methods
- `/income/{sk}` child resource with PUT, DELETE methods
- `/balance` resource with GET method
- `/insights` resource → `/insights/top-spending` and `/insights/top-sources` with GET methods
- `/statements` resource → `/statements/upload-url` with POST method
- `/statements/{statementId}` child → `/status` and `/preview` with GET, and root POST for import

All routes must use the existing Cognito User Pool Authorizer. All routes must include CORS configuration matching the frontend origin.
