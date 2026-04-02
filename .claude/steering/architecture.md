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
| Cognito | Authentication (email-based, SRP + password flows) |
| DynamoDB | Primary data store (pay-per-request, tables per domain as needed) |
| Lambda (NodejsFunction) | Business logic, bundled with esbuild |
| API Gateway | REST API (v1) with Cognito User Pool Authorizer |
| S3 | Statement file uploads (PDF/CSV) |
| Textract / Custom parser | Text extraction from bank statements |
| Amplify Hosting | Frontend deployment with custom domain, CI/CD, HTTPS, CDN |

## Data Layer

- DynamoDB is the primary data store, but the architecture is not locked to a single-table design
- New features may introduce additional DynamoDB tables or other storage services as needed
- Data model decisions (table design, indexes, access patterns) should be defined per feature during the spec/design phase
- The `DataStack` manages all data resources and exports references for other stacks

### Current Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `laskifin-Ledger` | Transaction ledger (income, expenses, installments) | Exists (needs English field migration) |

## CDK Stack Structure

The infrastructure is split into independent stacks from the start for clean separation of concerns and independent deployment:

| Stack | File | Resources | Cross-Stack Refs |
|-------|------|-----------|-----------------|
| `AuthStack` | `auth-stack.ts` | Cognito User Pool, Client, Domain | Exports: `userPoolId`, `userPoolClientId` |
| `DataStack` | `data-stack.ts` | DynamoDB tables, GSIs | Exports: `ledgerTableName`, `ledgerTableArn` |
| `ApiStack` | `api-stack.ts` | API Gateway, Lambda functions, IAM roles | Imports from Auth + Data |
| `FrontendStack` | `frontend-stack.ts` | Amplify App, branch config, custom domain | Imports from Auth + Api |

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
│           └── transactions/       # Transaction domain handlers
├── front/                          # React + Vite + Chakra UI (not yet created)
├── infra/
│   ├── bin/infra.ts                # CDK app entry point (instantiates all stacks)
│   ├── config/environments.ts      # Dev/Prod environment configs
│   └── lib/
│       ├── auth-stack.ts           # Cognito User Pool, Client, Domain
│       ├── data-stack.ts           # DynamoDB tables, GSIs
│       ├── api-stack.ts            # API Gateway, Lambda functions
│       └── frontend-stack.ts       # Amplify Hosting, custom domain
├── cdk.json                        # CDK configuration
├── tsconfig.json                   # Root TypeScript config
└── package.json                    # Monorepo root
```

## Resource Tagging Strategy

All AWS resources created via CDK must be tagged for observability, cost tracking, and operational clarity. Tags are applied at two levels:

### App-Level Tags (applied in `infra/bin/infra.ts` via `cdk.Tags.of(app).add(...)`)

| Tag Key | Value | Purpose |
|---------|-------|---------|
| `project` | `projectConfig.appName` | Groups all resources under the project for Cost Explorer and billing reports |
| `environment` | `environment.stage` | Filters resources by deployment stage (dev/prod) |
| `managed-by` | `cdk` | Distinguishes IaC-managed resources from manually created ones (drift detection, cleanup audits) |
| `cost-center` | `personal` | FinOps grouping for budget alerts and cost allocation |
| `owner` | `laski` | Contact/team responsible for the resources |

### Stack-Level Tags (applied in each stack constructor via `cdk.Tags.of(this).add(...)`)

| Tag Key | Value | Purpose |
|---------|-------|---------|
| `stack` | Stack name (e.g., `AuthStack`, `DataStack`) | Identifies which stack owns the resource for troubleshooting and cost breakdown per stack |

### Rules

- App-level tags propagate to all resources in all stacks automatically
- Stack-level `stack` tag is added inside each stack's constructor so it reflects the actual owning stack
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
- **Auth**: Amplify JS libraries for Cognito integration (sign-in, sign-up, session management)
- **Custom Domain**: `appfin.kioshitechmuta.link` (subdomain of existing Route 53 hosted zone)
  - Route 53 hosted zone: `kioshitechmuta.link` (already exists — always use `route53.HostedZone.fromLookup`, never create a new zone)
  - DNS: CNAME or alias record pointing to Amplify-provided domain
  - Amplify handles SSL certificate provisioning automatically
  - Branch-based deployments: `main` → `appfin.kioshitechmuta.link`, `dev` → `devfin.kioshitechmuta.link`
- **UI Library**: Chakra UI — prop-based component API, pre-styled components, fast to build forms/tables/dashboards
