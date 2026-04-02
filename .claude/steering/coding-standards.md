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
- Always extract `userId` from `event.requestContext.authorizer?.claims.sub`
- Never trust client input — validate all fields using Zod for runtime validation that stays in sync with TypeScript types
- Return structured JSON errors with appropriate HTTP status codes
- Use `DynamoDBDocumentClient` (not raw `DynamoDBClient`) for item operations
- Use AWS Lambda Powertools for TypeScript for structured logging, metrics, and tracing (X-Ray)

## Language

- All code, comments, variable names, field names, and API responses MUST be in English
- DynamoDB attribute names must be English (e.g., `description`, `amount`, `type`, `source`, `category`)
- Lambda response messages in English
- CDK resource names and descriptions in English
- Code comments in English
- Commit messages in English
- When refactoring existing Portuguese code, rename fields to their English equivalents (see Domain Language mapping in project-overview.md)

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

## Error Handling

- Lambda handlers wrap logic in try/catch
- Log errors with `console.error` (CloudWatch integration)
- Return user-friendly error messages, never expose internal details
- Use specific HTTP status codes: 400 for validation, 404 for not found, 500 for unexpected

## Testing

- Infrastructure tests in `infra/test/`
- Lambda unit tests should go in `back/lambdas/test/`
- Use `invoke-local.ts` pattern for quick local debugging against real AWS resources
