---
inclusion: auto
---

# LASKI Finances — Backend Standards

## Lambda Handler Pattern

- One file per operation under `back/lambdas/src/<domain>/<action>.ts`
- Signature: `APIGatewayProxyEvent` → `APIGatewayProxyResult`
- Always extract `userId` from `event.requestContext.authorizer?.claims.sub`; return 401 immediately if absent
- Validate all inputs with Zod (`.safeParse()`); return 400 on failure
- Instantiate `DynamoDBDocumentClient` once at **module scope** — never inside the handler function
- Call `decodeSk()` on path parameters (API Gateway doesn't fully decode `%23` → `#`)
- Use AWS Lambda Powertools for structured logging, metrics, and tracing (X-Ray)

## Data Normalisation

Applied in every handler that writes a Ledger item (`create-transaction`, `update-transaction`, `create-income`, `update-income`, `import-statement`):

- `category`: `.trim().toLowerCase()`
- `source`: `.trim().toLowerCase()`
- `categoryMonth`: `normalisedCategory + "#" + YYYY-MM` — always built from the already-normalised `category`

## Shared Utilities

Reusable logic lives in `back/lambdas/src/shared/`. Import from there — never inline repeated logic.

| File | Purpose |
|------|---------|
| `update-monthly-summary.ts` | Atomically updates `laskifin-MonthlySummary` on every Ledger write. ALL write handlers MUST call this — never inline it. |

Rules:
- Never import a shared utility inside a test mock — mock the utility at module level
- Shared utilities must have their own unit tests in `back/lambdas/test/shared/`

## Error Handling

- Wrap all handler logic in `try/catch`
- Log errors with `console.error` — include the full error object, never just the message
- Return user-friendly messages; never expose stack traces or DynamoDB error codes
- HTTP status mapping:
  - 400: validation failure
  - 401: missing/invalid Cognito sub
  - 404: not found, `ConditionalCheckFailedException`
  - 409: conflict
  - 500: unexpected errors
- Zod errors → `{ "error": "Validation failed", "details": ["..."] }`

## Testing (Backend)

Framework: **Vitest** (lambdas), **Jest** (infra CDK assertions).

### Property-based tests

- Use `fast-check`, minimum **100 iterations** (`{ numRuns: 100 }`)
- Tag every property test: `// Feature: <name>, Property <N>: <description>`
- One test per property — never combine multiple properties in one test

### Test file locations

```
back/lambdas/test/
├── shared/          # updateMonthlySummary and other shared utilities
├── transactions/    # transaction CRUD handlers
├── income/          # income CRUD handlers
├── balance/         # get-balance handler
├── insights/        # top-spending and top-sources handlers
├── migration/       # backfill-migration Lambda
└── advisor/         # advisor-chat handler

infra/test/          # CDK assertion tests per stack
```

### CDK assertion requirements

Every new Lambda and API route must have assertion tests verifying:
- Route exists with the correct HTTP method and Cognito authorizer attached
- Lambda has correct memory, timeout, and runtime
- All required environment variables are set (`TABLE_NAME`, `SUMMARY_TABLE_NAME`, etc.)
- IAM grants are scoped correctly (`grantReadData` vs `grantReadWriteData`)
