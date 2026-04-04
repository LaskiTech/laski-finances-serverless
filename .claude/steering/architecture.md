---
inclusion: always
---

# LASKI Finances — Architecture & Infrastructure

## Tech Stack

- **Runtime**: Node.js 22.x / TypeScript (ES2022, NodeNext modules)
- **Infrastructure**: AWS CDK v2.244.0 (TypeScript)
- **Cloud Provider**: AWS (serverless-first)
- **Monorepo**: npm workspaces (`back/`, `front/`, `infra/`)
- **Frontend**: React + TypeScript (Vite), hosted on AWS Amplify

## AWS Services

| Service | Purpose |
|---------|---------|
| Cognito | Authentication (email + password, Google federated via Hosted UI) |
| DynamoDB | Primary data store (pay-per-request, multiple tables per domain) |
| Lambda (NodejsFunction) | Business logic, bundled with esbuild |
| API Gateway | REST API (v1) with Cognito User Pool Authorizer |
| S3 | Statement file uploads (PDF/CSV) |
| Secrets Manager | Google OAuth client secret; Anthropic API key |
| Textract / Custom parser | Text extraction from bank statements |
| Amplify Hosting | Frontend deployment with custom domain, HTTPS, CDN |

## Data Layer

- DynamoDB is the primary data store. The architecture uses multiple tables per domain — not a strict single-table design.
- All tables are managed in `DataStack` and exported as cross-stack references for `ApiStack`.
- See `data-model.md` for full table schemas, GSI definitions, and access patterns.

### Current Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `laskifin-Ledger` | All financial entries — income, expenses, installments | Exists in production |
| `laskifin-MonthlySummary` | Pre-aggregated monthly totals per user | New — add to DataStack |
| `laskifin-Links` | Relationships between Ledger entries | New — add to DataStack |
| `laskifin-Statements` | Statement upload lifecycle tracking | New — add to DataStack when building statement upload |

## CDK Stack Structure

The infrastructure is split into independent stacks for clean separation of concerns and independent deployment:

| Stack | File | Resources | Cross-Stack Exports |
|-------|------|-----------|---------------------|
| `AuthStack` | `auth-stack.ts` | Cognito User Pool, Client, Hosted UI Domain, Google IdP, PreSignUp Lambda | `userPoolId`, `userPoolClientId`, `cognitoDomain` |
| `DataStack` | `data-stack.ts` | DynamoDB tables, GSIs | `ledgerTableName`, `ledgerTableArn`, `summaryTableName`, `summaryTableArn`, `linksTableName`, `linksTableArn` |
| `ApiStack` | `api-stack.ts` | API Gateway, Lambda functions, IAM roles | `apiUrl` |
| `FrontendStack` | `frontend-stack.ts` | Amplify App, branch config, custom domain | — |

### Cross-Stack Communication

- Use CDK `CfnOutput` exports and `Fn.importValue` for references between stacks
- Deploy order: `AuthStack` → `DataStack` → `ApiStack` → `FrontendStack`
- Each stack can be deployed independently after initial setup

## Project Structure

```
laski-finances-serveless/
├── back/
│   └── lambdas/
│       └── src/
│           ├── shared/                  # Shared utilities (updateMonthlySummary, etc.)
│           ├── transactions/            # Expense CRUD handlers
│           ├── income/                  # Income CRUD handlers
│           ├── balance/                 # Balance overview handler
│           ├── insights/                # Top spending + top sources handlers
│           ├── advisor/                 # AI financial advisor handler
│           ├── links/                   # Linking layer handlers
│           └── migration/               # One-time backfill migration Lambda
├── front/
│   └── src/
│       ├── auth/                        # Amplify config, AuthProvider, useAuth, auth-service
│       ├── api/                         # API client modules (transactions, income, balance, etc.)
│       ├── components/                  # Shared UI components (BalanceWidget, InsightsWidget, etc.)
│       ├── pages/                       # Page components (DashboardPage, TransactionsPage, etc.)
│       └── routes.tsx                   # React Router route definitions
├── infra/
│   ├── bin/infra.ts                     # CDK app entry point
│   ├── config/environments.ts           # Dev/Prod environment configs
│   └── lib/
│       ├── auth-stack.ts
│       ├── data-stack.ts
│       ├── api-stack.ts
│       └── frontend-stack.ts
├── .claude/
│   ├── steering/                        # Architecture, data model, API contract, coding standards
│   └── specs/                           # Feature requirements and design docs
├── cdk.json
├── tsconfig.json
└── package.json
```

## Resource Tagging Strategy

All AWS resources created via CDK must be tagged for observability, cost tracking, and operational clarity. Tags are applied at two levels:

### App-Level Tags (applied in `infra/bin/infra.ts` via `cdk.Tags.of(app).add(...)`)

| Tag Key | Value | Purpose |
|---------|-------|---------|
| `project` | `projectConfig.appName` | Groups all resources under the project for Cost Explorer and billing reports |
| `environment` | `environment.stage` | Filters resources by deployment stage (dev/prod) |
| `managed-by` | `cdk` | Distinguishes IaC-managed resources from manually created ones |
| `cost-center` | `personal` | FinOps grouping for budget alerts and cost allocation |
| `owner` | `laski` | Contact/team responsible for the resources |

### Stack-Level Tags (applied in each stack constructor via `cdk.Tags.of(this).add(...)`)

| Tag Key | Value | Purpose |
|---------|-------|---------|
| `stack` | Stack name (e.g., `AuthStack`, `DataStack`) | Identifies which stack owns the resource |

### Rules

- App-level tags propagate to all resources in all stacks automatically
- Stack-level `stack` tag is added inside each stack's constructor
- New stacks must always include the `stack` tag
- Tag values must be lowercase and use hyphens for multi-word values (e.g., `laski-finances`)

## Environment Configuration

- `dev`: us-west-2 (default)
- `prod`: us-west-1
- Environment is selected via CDK context: `-c env=dev`

### Resource Naming

- Resource names (DynamoDB tables, Lambda functions, API Gateway endpoints, etc.) must NOT include the stage/environment suffix (e.g., use `laskifin-Ledger`, not `laskifin-Ledger-dev`)
- Environment isolation is handled by CDK through separate stacks and AWS accounts/regions — not by name suffixes
- This keeps Lambda code simple: table names and endpoints are fixed constants, no dynamic resolution needed
- Tags (specifically the `environment` tag) are used to distinguish resources across environments, not resource names

## Frontend Stack

- **Framework**: React + TypeScript, built with Vite
- **Hosting**: AWS Amplify Hosting (managed CI/CD, HTTPS, CDN)
- **Auth**: Amplify JS v6 (modular imports) for Cognito integration — email/password and Google federated sign-in
- **Custom Domain**: `appfin.kioshitechmuta.link` (subdomain of existing Route 53 hosted zone)
  - Route 53 hosted zone: `kioshitechmuta.link` (already exists — always use `route53.HostedZone.fromLookup`, never create a new zone)
  - DNS: CNAME or alias record pointing to Amplify-provided domain
  - Amplify handles SSL certificate provisioning automatically
  - Branch-based deployments: `main` → `appfin.kioshitechmuta.link`, `dev` → `devfin.kioshitechmuta.link`
- **UI Library**: Chakra UI v3 — prop-based component API, pre-styled components, fast to build forms/tables/dashboards

## Secrets Management

- Google OAuth client secret: stored in AWS Secrets Manager at `laski/google-oauth-client-secret`
- Anthropic API key: stored in AWS Secrets Manager at `laski/anthropic-api-key`
- Neither secret is ever hardcoded, passed via CDK context, or stored in environment variables visible in CloudFormation
- Lambdas retrieve secrets at runtime via `@aws-sdk/client-secrets-manager` and cache them for the lifetime of the warm container
