---
inclusion: auto
---

# LASKI Finances — Infrastructure Standards

## CDK Stack Overview

| Stack | File | Resources | Cross-Stack Exports |
|-------|------|-----------|---------------------|
| `AuthStack` | `auth-stack.ts` | Cognito User Pool, Client, Hosted UI Domain, Google IdP, PreSignUp Lambda | `userPoolId`, `userPoolClientId`, `cognitoDomain` |
| `DataStack` | `data-stack.ts` | DynamoDB tables, GSIs | `ledgerTableName`, `ledgerTableArn`, `summaryTableName`, `summaryTableArn`, `linksTableName`, `linksTableArn` |
| `ApiStack` | `api-stack.ts` | API Gateway, Lambda functions, IAM roles | `apiUrl` |
| `FrontendStack` | `frontend-stack.ts` | Amplify App, branch config, custom domain | — |

Deploy order: `AuthStack` → `DataStack` → `ApiStack` → `FrontendStack`.

Use CDK `CfnOutput` exports and `Fn.importValue` for cross-stack references.

## Lambda CDK Pattern

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

Rules:
- Always set explicit `memorySize`, `timeout`, and `runtime`
- Use `Runtime.NODEJS_22_X`
- Use `path.resolve(__dirname, ...)` for entry paths
- Follow least-privilege IAM: `grantReadData`, `grantWriteData` — never broad policies
- Every Lambda that writes to `laskifin-Ledger` MUST also have `SUMMARY_TABLE_NAME` env var + IAM grant on MonthlySummary

## DynamoDB CDK Pattern

- Billing: `PAY_PER_REQUEST`
- Always enable `pointInTimeRecovery: true`

## Resource Naming

Resource names MUST NOT include the stage suffix (e.g., use `laskifin-Ledger`, not `laskifin-Ledger-dev`).

Environment isolation is handled by CDK via separate stacks and AWS accounts/regions — not by name suffixes. This keeps Lambda code simple: table names are fixed constants.

## Environment Configuration

| Env | Region |
|-----|--------|
| dev | us-west-2 |
| prod | us-west-1 |

Selected via CDK context: `-c env=dev` or `-c env=prod`.

## Resource Tagging

### App-level tags (in `infra/bin/infra.ts` via `cdk.Tags.of(app).add(...)`)

| Tag | Value |
|-----|-------|
| `project` | `projectConfig.appName` |
| `environment` | `environment.stage` |
| `managed-by` | `cdk` |
| `cost-center` | `personal` |
| `owner` | `laski` |

### Stack-level tag (in each stack constructor)

| Tag | Value |
|-----|-------|
| `stack` | Stack name (e.g., `AuthStack`) |

Tag values must be lowercase with hyphens for multi-word values. New stacks must always include the `stack` tag.

## Secrets Management

- Google OAuth client secret: `laski/google-oauth-client-secret` (Secrets Manager)
- Anthropic API key: `laski/anthropic-api-key` (Secrets Manager)
- Never hardcode secrets, pass via CDK context, or store in CloudFormation parameters
- Lambdas retrieve secrets at runtime via `@aws-sdk/client-secrets-manager` and cache for the container lifetime

## Route 53

The hosted zone `kioshitechmuta.link` already exists — always use `route53.HostedZone.fromLookup`. Never create a new zone.
