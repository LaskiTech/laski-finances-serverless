---
inclusion: always
---

# LASKI Finances — Architecture Overview

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 22.x / TypeScript (ES2022, NodeNext) |
| Infrastructure | AWS CDK v2.244.0 (TypeScript) |
| Monorepo | npm workspaces (`back/`, `front/`, `infra/`) |
| Frontend | React 19 + Vite + Chakra UI v3, hosted on Amplify |
| Auth | Cognito (email + password + Google federated via Hosted UI) |
| Data | DynamoDB (PAY_PER_REQUEST, multiple tables per domain) |
| API | API Gateway REST v1 + Lambda (NodejsFunction / esbuild) |
| Storage | S3 (statement uploads) |
| Secrets | AWS Secrets Manager |

## Project Structure

```
laski-finances-serverless/
├── back/lambdas/src/
│   ├── shared/          # updateMonthlySummary and other shared utilities
│   ├── transactions/    # Expense CRUD handlers
│   ├── income/          # Income CRUD handlers
│   ├── balance/         # Balance overview handler
│   ├── insights/        # Top spending + top sources handlers
│   ├── advisor/         # AI financial advisor handler
│   ├── links/           # Linking layer handlers
│   └── migration/       # One-time backfill migration Lambda
├── front/src/
│   ├── auth/            # Amplify config, AuthProvider, useAuth, auth-service
│   ├── api/             # API client modules (transactions, income, balance, etc.)
│   ├── components/      # Shared UI components
│   ├── pages/           # Page components
│   └── routes.tsx
├── infra/
│   ├── bin/infra.ts     # CDK app entry point
│   ├── config/          # Dev/Prod environment configs
│   └── lib/             # auth-stack, data-stack, api-stack, frontend-stack
└── .claude/
    ├── steering/        # Role-specific standards and contracts
    └── specs/           # Feature requirements and design docs
```

## Key Rules (All Roles)

- Every Lambda that writes to `laskifin-Ledger` **must** also update `laskifin-MonthlySummary` by calling the shared `updateMonthlySummary()` utility — this is non-optional
- Resource names have no stage suffix (e.g., `laskifin-Ledger`, not `laskifin-Ledger-dev`)
- `category` and `source` are always normalised to `.trim().toLowerCase()` before any DynamoDB write
- All code, field names, and API responses are in English; UI text is in Portuguese
