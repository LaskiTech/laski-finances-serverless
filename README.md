# LASKI Finances

A personal finance management platform built on AWS Serverless architecture. Gives users a clear view of their financial health by comparing income and expenses, with support for installment tracking, categorized transactions, and bank statement imports.

## Features

| Feature | Description | Status |
|---------|-------------|--------|
| Login | Cognito-based authentication (email + password) | Infra ready |
| Expense Tracking | Record and categorize expenses, with installment support | In progress |
| Income Tracking | Record income entries tied to sources | Not started |
| Data Queries | Filter/search transactions by month, type, source, category | Not started |
| Balance Overview | Monthly summary comparing total income vs total expenses | Not started |
| Top Spending Insights | Highlight top categories and sources by spend amount | Not started |
| Statement Upload | Upload bank statements (PDF/CSV), extract transactions automatically | Not started |

## Tech Stack

- **Runtime**: Node.js 22.x / TypeScript
- **Infrastructure**: AWS CDK v2.244.0
- **Frontend**: React + Vite + Chakra UI, hosted on AWS Amplify
- **Backend**: AWS Lambda (NodejsFunction) + API Gateway REST API
- **Auth**: Amazon Cognito (User Pool Authorizer)
- **Database**: Amazon DynamoDB (pay-per-request)
- **Validation**: Zod
- **Observability**: AWS Lambda Powertools (structured logging, metrics, X-Ray tracing)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Amplify    │────▶│  API Gateway │────▶│   Lambda    │────▶│ DynamoDB │
│  (React UI) │     │  (REST + Auth)│     │ (Handlers)  │     │          │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
                           │
                    ┌──────┴──────┐
                    │   Cognito   │
                    │ (User Pool) │
                    └─────────────┘
```

### CDK Stacks

| Stack | Purpose |
|-------|---------|
| `AuthStack` | Cognito User Pool, Client, Domain |
| `DataStack` | DynamoDB tables, GSIs |
| `ApiStack` | API Gateway, Lambda functions, IAM roles |
| `FrontendStack` | Amplify App, custom domain |

## Project Structure

```
laski-finances-serveless/
├── back/
│   └── lambdas/
│       └── src/
│           └── transactions/       # Transaction domain handlers
├── front/                          # React + Vite + Chakra UI
├── infra/
│   ├── bin/infra.ts                # CDK app entry point
│   ├── config/environments.ts      # Dev/Prod environment configs
│   └── lib/
│       ├── auth-stack.ts           # Cognito
│       ├── data-stack.ts           # DynamoDB
│       ├── api-stack.ts            # API Gateway + Lambdas
│       └── frontend-stack.ts       # Amplify Hosting
├── cdk.json
├── tsconfig.json
└── package.json                    # Monorepo root (npm workspaces)
```

## Prerequisites

- Node.js 22.x (enforced via `.nvmrc`)
- AWS CLI configured with appropriate credentials
- AWS CDK CLI

## Getting Started

```bash
# Install dependencies (uses lockfile for reproducible builds)
npm ci

# Deploy infrastructure (dev environment)
npx cdk deploy --all -c env=dev

# Deploy a specific stack
npx cdk deploy AuthStack -c env=dev
```

## Frontend Deploy (Amplify)

Since the Amplify app has no Git repo connected, deploys are done manually via CLI.

### Prerequisites

1. Create `front/.env` with your Cognito values (see `front/.env.example`):

```
VITE_COGNITO_USER_POOL_ID=us-west-2_XXXXXXXX
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

2. Set the `AMPLIFY_APP_ID` environment variable:

```bash
export AMPLIFY_APP_ID=<your-app-id>
```

### Deploy with script

```bash
bash scripts/deploy-front.sh
```

To deploy to a specific branch:

```bash
AMPLIFY_BRANCH=main bash scripts/deploy-front.sh
```

### Check deployment status

```bash
aws amplify get-job --app-id <your-app-id> --branch-name dev --job-id <jobId>
```

> If a previous deployment is stuck, stop it first:
> `aws amplify stop-job --app-id <your-app-id> --branch-name dev --job-id <jobId>`

## Environments

| Environment | Region | Domain |
|-------------|--------|--------|
| `dev` | us-west-2 | `devfin.kioshitechmuta.link` |
| `prod` | us-west-1 | `appfin.kioshitechmuta.link` |

## Development Guidelines

- All code, comments, and commit messages in English
- Exact dependency versions only (no `^` or `~`)
- Use `npm ci` instead of `npm install`
- Version upgrades require a dedicated task
- See `.kiro/steering/` for detailed coding standards and architecture docs
