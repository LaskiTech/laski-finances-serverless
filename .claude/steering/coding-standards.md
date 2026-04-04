---
inclusion: always
---

# LASKI Finances — Coding Standards

## Dependency Management

- All dependencies MUST use exact versions (no `^` or `~` prefixes) in `package.json`
  - Example: `"aws-cdk-lib": "2.244.0"` not `"aws-cdk-lib": "^2.244.0"`
  - CDK alpha packages (e.g., `@aws-cdk/*-alpha`) MUST match the exact `aws-cdk-lib` version to avoid JSII type conflicts
  - Prefer stable constructs from `aws-cdk-lib` over alpha packages whenever possible
- `package-lock.json` MUST be committed to git — never gitignored
- All developers MUST use `npm ci` (not `npm install`) to install dependencies, ensuring the lockfile is respected
- `npm ci` MUST always be executed from the project root directory — NEVER from individual workspace folders (`back/`, `infra/`). The root `package.json` manages all workspaces via npm workspaces, so running `npm ci` at the root installs dependencies for all workspaces at once
- The only exception is `front/` — Amplify Hosting runs `npm ci` inside the `front/` folder during its build process, so `npm ci` in `front/` is allowed
- Version upgrades are intentional changes — they require a dedicated task or feature, not a side-effect of other work
- When upgrading a dependency, update ALL workspaces that reference it in the same commit
- Node.js version should be enforced via `.nvmrc` file at the repo root (e.g., `22`)
- Add `engines` field to root `package.json` to enforce Node.js version: `"engines": { "node": ">=22.0.0" }`

## Lambda Handlers

- Each handler lives in its own file under `back/lambdas/src/<domain>/<action>.ts`
- Handler signature: `APIGatewayProxyEvent` → `APIGatewayProxyResult`
- Always extract `userId` from `event.requestContext.authorizer?.claims.sub`; return HTTP 401 immediately if absent
- Never trust client input — validate all fields using Zod for runtime validation that stays in sync with TypeScript types
- Return structured JSON errors with appropriate HTTP status codes
- Use `DynamoDBDocumentClient` (not raw `DynamoDBClient`) for item operations
- Use AWS Lambda Powertools for TypeScript for structured logging, metrics, and tracing (X-Ray)
- Instantiate the DynamoDB client once at module scope (outside the handler function), not inside the handler, to reuse connections across warm invocations

## Shared Utilities

Reusable logic that spans multiple handlers lives in `back/lambdas/src/shared/`. Handlers import from this folder rather than inlining repeated logic.

### Current shared utilities

| File | Purpose |
|------|---------|
| `back/lambdas/src/shared/update-monthly-summary.ts` | Atomically updates `laskifin-MonthlySummary` on every Ledger write. All write handlers (create, update, delete, import) MUST call this — never inline the DynamoDB expression. See `data-model.md` for the full utility implementation. |

### Rules for shared utilities

- Never import from a shared utility file inside a test mock — mock the utility itself at the module level
- Shared utilities must have their own unit tests in `back/lambdas/test/shared/`
- A handler that needs a side effect that another handler also needs is a signal to extract a shared utility, not to copy-paste

## Data Normalisation

All string fields written to DynamoDB that are used as GSI keys or for aggregation must be normalised before write. Failure to normalise causes the same logical value to appear as multiple distinct values in query results and insights.

**Mandatory normalisation rules — apply in every create and update handler:**

- `category`: `category.trim().toLowerCase()` — stored value must always be lowercase and trimmed
- `source`: `source.trim().toLowerCase()` — stored value must always be lowercase and trimmed
- `categoryMonth`: derived as `normalisedCategory + "#" + YYYY-MM` — always built from the already-normalised `category`, never from the raw input

These rules apply to every handler that writes a Ledger item: `create-transaction`, `update-transaction`, `create-income`, `update-income`, and `import-statement`.

## Language

- All code, comments, variable names, field names, and API responses MUST be in English
- DynamoDB attribute names must be English (e.g., `description`, `amount`, `type`, `source`, `category`)
- Lambda response messages in English
- CDK resource names and descriptions in English
- Code comments in English
- Commit messages in English
- When refactoring existing Portuguese code, rename fields to their English equivalents (see Domain Language mapping in `project-overview.md`)

## TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- Use `NodeNext` module resolution
- Prefer `const` over `let`, never use `var`
- Use explicit return types on exported functions

## CDK Infrastructure

- Use `NodejsFunction` (esbuild-bundled) for all Lambda definitions
  - Set `minify: true` and `sourceMap: true` in bundling options for smaller bundles and CloudWatch debugging
- Always set explicit `memorySize`, `timeout`, and `runtime`
- Use `Runtime.NODEJS_22_X` for Lambda runtime (available in all regions)
- Follow least-privilege IAM: use `grantReadData`, `grantWriteData` instead of broad policies
- Do NOT append the stage/environment name (e.g., `-dev`, `-prod`) to resource names (DynamoDB tables, Lambda functions, API Gateway endpoints, etc.). CDK already isolates environments via separate stacks and accounts — stage suffixes in resource names add unnecessary complexity, especially in Lambda code that would need to resolve names dynamically. Use fixed, predictable resource names (e.g., `laskifin-Ledger`, not `laskifin-Ledger-dev`)
- Use `path.resolve(__dirname, ...)` for Lambda entry paths
- DynamoDB tables use `PAY_PER_REQUEST` billing mode
- Enable `pointInTimeRecovery` on all tables
- Every new Lambda that writes to `laskifin-Ledger` must also receive `SUMMARY_TABLE_NAME` as an environment variable and be granted the appropriate IAM permission on `laskifin-MonthlySummary`

## Error Handling

- Lambda handlers wrap all logic in `try/catch`
- Log errors with `console.error` (CloudWatch integration) — include the original error object, never just the message
- Return user-friendly error messages, never expose internal details (stack traces, DynamoDB error codes)
- Use specific HTTP status codes: 400 for validation, 401 for missing auth, 404 for not found, 409 for conflicts, 500 for unexpected errors
- Map `DynamoDB.ConditionalCheckFailedException` to HTTP 404, not 500
- Zod validation errors are mapped to user-friendly messages via `issue.message` and returned as `{ "error": "Validation failed", "details": ["..."] }`

## Testing

### Framework and tooling

| Scope | Framework | Library |
|-------|-----------|---------|
| Frontend unit + property tests | Vitest | `fast-check` for property-based |
| Backend Lambda unit + property tests | Jest | `fast-check` for property-based |
| Infrastructure CDK assertions | Jest + `aws-cdk-lib/assertions` | — |

### Property-based testing

Every feature spec defines correctness properties — universal statements that must hold across all valid inputs. Each property is implemented as exactly one property-based test using `fast-check`.

**Rules:**
- Minimum 100 iterations per property test (`fc.assert(fc.property(...), { numRuns: 100 })`)
- Each property test file must include a tag comment on the test:
  ```typescript
  // Feature: <feature-name>, Property <N>: <property description>
  ```
- One test per property — do not combine multiple properties into one test
- Property tests live alongside unit tests in the same test file, clearly separated by a comment block

### Test file locations

```
back/lambdas/test/
├── shared/                  # Tests for shared utilities (updateMonthlySummary, etc.)
├── transactions/            # Tests for transaction CRUD handlers
├── income/                  # Tests for income CRUD handlers
├── balance/                 # Tests for get-balance handler
├── insights/                # Tests for top-spending and top-sources handlers
├── migration/               # Tests for backfill-migration Lambda
└── advisor/                 # Tests for advisor-chat handler

infra/test/                  # CDK assertion tests per stack

front/src/
├── __tests__/               # Page-level component tests
└── components/__tests__/    # Widget and component tests
```

### Infrastructure tests (CDK assertions)

Every new Lambda and API route must have corresponding CDK assertion tests verifying:
- The route exists on the API Gateway with the correct HTTP method
- The Cognito authoriser is attached
- The Lambda has the correct memory, timeout, and runtime
- All required environment variables are set (`TABLE_NAME`, `SUMMARY_TABLE_NAME`, etc.)
- IAM grants are scoped correctly (`grantReadData` vs `grantReadWriteData`)

### Local debugging

- Use `invoke-local.ts` pattern for quick local debugging against real AWS resources
- Never run migration Lambdas locally against production — always target dev
