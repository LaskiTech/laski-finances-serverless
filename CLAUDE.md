# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Steering & Specs

All architectural decisions, coding standards, data model, and API contracts are fully documented in `.claude/steering/`. These files are always loaded into context — **read them before writing any code**. Feature requirements and designs live in `.claude/specs/<feature>/`.

## Commands

All commands run from the repo root unless noted. Always use `npm ci` (not `npm install`).

```bash
# Install dependencies (all workspaces)
npm ci

# Run tests
npm test --workspace=back/lambdas     # Backend Lambda tests (Vitest)
npm test --workspace=infra            # CDK assertion tests (Jest)
npm test --workspace=front            # Frontend tests (Vitest + RTL)

# CDK operations (run from root)
npx cdk diff --all -c env=dev
npx cdk deploy --all -c env=dev
npx cdk deploy --all -c env=prod

# Frontend local dev
npm run front:dev

# Build everything
npm run build
```

## Architecture Overview

This is a **personal finance serverless app** deployed on AWS. The repo is an npm workspace monorepo with three packages: `back/lambdas`, `infra`, and `front`.

### Backend (`back/lambdas/src/<domain>/`)

One file per Lambda operation: `create-`, `list-`, `get-`, `update-`, `delete-` prefixes. All handlers:
- Are wrapped by `withAuth()` HOF (authentication guard, logger, structured error handling)
- Extract `userId` from `event.requestContext.authorizer?.claims.sub` and return 401 if missing
- Validate all inputs with Zod (`.safeParse()`) and return 400 on failure
- Use `DynamoDBDocumentClient` (not raw client) instantiated at **module scope** for warm reuse
- Normalize category/source values with `.trim().toLowerCase()` before any DynamoDB write
- Call `decodeSk()` on path parameters (API Gateway doesn't fully decode `%23` → `#`)

**Transaction Sort Key format**: `TRANS#YYYY-MM#INC|EXP#<uuid>` — contains `#` chars requiring URL decoding.

**Installment pattern**: N items sharing a `groupId`, sequential `installmentNumber`, offset dates, each self-contained with `totalAmount` + `installmentTotal`.

### Infrastructure (`infra/`)

Four CDK stacks created in `infra/bin/infra.ts`:
1. **AuthStack** — Cognito User Pool + Client + Domain
2. **DataStack** — DynamoDB tables + GSIs
3. **ApiStack** — API Gateway (REST v1) + NodejsFunction Lambdas + IAM grants + Cognito authorizer
4. **FrontendStack** — Amplify App + custom domain

Resource naming: `laskifin-<Domain>` **with no stage suffix**. Environment isolation is via separate stacks + accounts + regions (dev: `us-west-2`, prod: `us-west-1`). Lambda environment variables provide table names.

Every Lambda that writes to the Ledger table **must** also have `SUMMARY_TABLE_NAME` env var + IAM grant on MonthlySummary and must call `updateMonthlySummary()` atomically — this is non-optional.

Secrets live in AWS Secrets Manager (`laski/google-oauth-client-secret`, `laski/anthropic-api-key`) — never in CDK context, CloudFormation, or code.

### Frontend (`front/`)

React 19 + TypeScript + Vite + Chakra UI v3 + AWS Amplify v6 (modular imports). Deployed manually via `scripts/deploy-front.sh` (Amplify has no Git repo connected). Auth via `front/src/auth/`.

### Data Model (key tables)

| Table | PK | SK |
|---|---|---|
| `laskifin-Ledger` | `USER#<cognitoSub>` | `TRANS#YYYY-MM#INC\|EXP#<uuid>` |
| `laskifin-MonthlySummary` | `USER#<cognitoSub>` | `SUMMARY#YYYY-MM` |

MonthlySummary is updated via DynamoDB `ADD` expressions on every Ledger write. Balance is always computed (`totalIncome - totalExpenses`) — never stored.

### Feature Status

| Feature | Backend | Frontend |
|---|---|---|
| Transaction CRUD | Deployed | Partial |
| Income CRUD | Specced only | Not started |
| Balance Overview | Specced only | Not started |
| Top Spending/Sources | Specced only | Not started |
| AI Financial Advisor | Specced only | Not started |
| Statement Upload | Not specced | Not started |

## Testing Standards

- Property-based tests use `fast-check` with minimum **100 iterations**
- Tag property tests: `// Feature: <feature-name>, Property <N>: <description>`
- Backend tests mock DynamoDB (Vitest); infra tests use CDK `Template.fromStack()` assertions

## Dependency Rules

Use **exact versions** only — no `^` or `~`. Treat version bumps as dedicated tasks.
