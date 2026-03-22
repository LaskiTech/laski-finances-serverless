# Implementation Plan: Infrastructure Refactor

## Overview

Decompose the monolithic `InfraCoreStack` into four independent CDK stacks (`AuthStack`, `DataStack`, `ApiStack`, `FrontendStack`), fix dependency versions and workspace config, migrate Lambda handler to English, add API Gateway with Cognito authorizer, set up Amplify Hosting, apply resource tagging, and delete the old monolithic stack. Each task builds incrementally so the CDK app remains synthesizable at every step.

## Tasks

- [x] 1. Fix dependency versions, workspace config, and environment configuration
  - [x] 1.1 Update root `package.json`: pin exact versions for `aws-cdk` (2.244.0), `aws-cdk-lib` (2.244.0), `constructs` (10.3.0), `esbuild` (0.19.11), `ts-node` (10.9.2), `typescript` (5.9.3), `@types/node` (20.19.27) — remove all `^` and `~` prefixes. Add `"engines": { "node": ">=22.0.0" }`. Fix workspace path from `Infra/*` to `infra`
    - _Requirements: 6.1, 6.2, 6.4, 6.5_
  - [x] 1.2 Update `infra/package.json`: set `aws-cdk-lib` to `2.244.0` and `constructs` to `10.3.0` (exact, no `^`)
    - _Requirements: 6.3_
  - [x] 1.3 Fix `infra/config/environments.ts`: change prod region from `us-east-1` to `us-west-1`
    - _Requirements: 7.1_
  - [ ]* 1.4 Write property test for exact dependency versions (Property 2)
    - **Property 2: Exact dependency versions**
    - Verify that `aws-cdk`, `aws-cdk-lib`, `constructs`, `esbuild`, `ts-node`, and `typescript` in root `package.json` have no `^` or `~` prefix
    - Test file: `infra/test/dependencies.test.ts`
    - **Validates: Requirements 6.1**

- [x] 2. Create AuthStack
  - [x] 2.1 Create `infra/lib/auth-stack.ts` with Cognito User Pool, User Pool Client, and User Pool Domain
    - Define `AuthStackProps` interface extending `cdk.StackProps` with `environment` and `projectConfig`
    - User Pool named `${prefix}-user-pool-${stage}`, email sign-in, self-sign-up, password policy (8+ chars, lower/upper/digit/symbol), email-only recovery
    - User Pool Client named `${prefix}-web-client-${stage}`, SRP + password auth flows, no secret
    - User Pool Domain with prefix `${prefix}-auth-${stage}`
    - CfnOutput exports: `${prefix}-user-pool-id-${stage}`, `${prefix}-user-pool-client-id-${stage}`, `${prefix}-user-pool-domain-${stage}`
    - Stack-level tag: `stack: auth-stack`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.6_
  - [ ]* 2.2 Write unit tests for AuthStack
    - Verify User Pool password policy, email sign-in, self-sign-up, CfnOutput exports exist
    - Test file: `infra/test/auth-stack.test.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Create DataStack
  - [x] 3.1 Create `infra/lib/data-stack.ts` with DynamoDB Ledger table and GSI
    - Define `DataStackProps` interface extending `cdk.StackProps` with `environment` and `projectConfig`
    - Table named `${prefix}-Ledger`, PK: `pk` (STRING), SK: `sk` (STRING), PAY_PER_REQUEST, pointInTimeRecovery enabled
    - GSI `GSI_LookupBySource`: PK `source` (STRING), SK `sk` (STRING), ALL projection — uses English field name `source` instead of `fonte`
    - CfnOutput exports: `${prefix}-ledger-table-name-${stage}`, `${prefix}-ledger-table-arn-${stage}`
    - Stack-level tag: `stack: data-stack`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 10.7_
  - [ ]* 3.2 Write unit tests for DataStack
    - Verify table key schema, billing mode, PITR, GSI with `source` attribute, CfnOutput exports
    - Test file: `infra/test/data-stack.test.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Create ApiStack
  - [x] 4.1 Create `infra/lib/api-stack.ts` with REST API, Cognito Authorizer, Lambda, and permissions
    - Define `ApiStackProps` interface extending `cdk.StackProps` with `environment` and `projectConfig`
    - REST API (v1) named `${prefix}-api-${stage}` with CORS enabled
    - Cognito User Pool Authorizer using User Pool ID imported via `Fn.importValue`
    - `NodejsFunction` for `createTransactionHandler`: runtime `NODEJS_22_X`, 256 MB, 10s timeout, `minify: true`, `sourceMap: true`, entry path via `path.resolve(__dirname, ...)`
    - `TABLE_NAME` env var from imported ledger table name, `grantWriteData` via imported table ARN
    - `/transactions` POST resource with Cognito authorizer
    - CfnOutput export: `${prefix}-api-url-${stage}`
    - Stack-level tag: `stack: api-stack`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 10.8_
  - [ ]* 4.2 Write unit tests for ApiStack
    - Verify REST API exists, Cognito authorizer attached, Lambda runtime/memory/timeout, IAM permissions
    - Test file: `infra/test/api-stack.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 5. Create FrontendStack
  - [x] 5.1 Create `infra/lib/frontend-stack.ts` with Amplify Hosting, branch config, and custom domain
    - Define `FrontendStackProps` interface extending `cdk.StackProps` with `environment` and `projectConfig`
    - Amplify App named `${prefix}-frontend-${stage}` (use L1 `CfnApp`/`CfnBranch`/`CfnDomain` from `aws-cdk-lib/aws-amplify` for stability)
    - Branch configs: `main` → `appfin.kioshitechmuta.link`, `dev` → `devfin.kioshitechmuta.link`
    - Use `route53.HostedZone.fromLookup` for existing `kioshitechmuta.link` zone — do NOT create a new hosted zone
    - Stack-level tag: `stack: frontend-stack`
    - _Requirements: 4.1, 4.2, 4.3, 10.9_
  - [ ]* 5.2 Write unit tests for FrontendStack
    - Verify Amplify App exists, no HostedZone creation resource in template
    - Test file: `infra/test/frontend-stack.test.ts`
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Checkpoint — Verify all stacks synthesize independently
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update CDK entry point and apply resource tags
  - [x] 7.1 Rewrite `infra/bin/infra.ts` to instantiate all 4 stacks with dependencies and app-level tags
    - Read environment from CDK context (`-c env=dev`), pass `environment` + `projectConfig` to each stack
    - Instantiate `AuthStack`, `DataStack`, `ApiStack`, `FrontendStack`
    - Add explicit dependencies: `apiStack.addDependency(authStack)`, `apiStack.addDependency(dataStack)`, `frontendStack.addDependency(apiStack)`
    - Apply 5 app-level tags via `cdk.Tags.of(app).add(...)`: `project`, `environment`, `managed-by`, `cost-center`, `owner`
    - Remove all references to `InfraCoreStack`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.10_
  - [ ]* 7.2 Write property tests for app-level and stack-level tags (Properties 3, 4)
    - **Property 3: App-level tags present on all stacks**
    - **Property 4: Stack-level tag matches stack identity**
    - Test file: `infra/test/tags.test.ts`
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10**
  - [ ]* 7.3 Write property tests for resource naming convention (Property 1)
    - **Property 1: Resource naming convention**
    - Test file: `infra/test/naming.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 3.1, 4.1**
  - [ ]* 7.4 Write property tests for cross-stack exports (Property 7)
    - **Property 7: Cross-stack exports are present and correctly named**
    - Test file: `infra/test/naming.test.ts` (can colocate with naming tests)
    - **Validates: Requirements 1.4, 2.3, 3.6, 5.1**

- [x] 8. Migrate Lambda handler to English
  - [x] 8.1 Rewrite `back/lambdas/src/transactions/create-transaction.ts` with English field names
    - Rename input fields: `descricao` → `description`, `valorTotal` → `totalAmount`, `parcelas` → `installments`, `data` → `date`, `categoria` → `category`, `fonte` → `source`, `tipo` → `type`
    - Sort key pattern uses `INC`/`EXP` instead of `REC`/`DESP`
    - Each DynamoDB item includes: `description`, `amount`, `totalAmount`, `category`, `source`, `type`, `date`, `groupId`, `installmentNumber` (1-based), `installmentTotal`
    - Installment description suffix: `${description} (${i+1}/${installments})`
    - English response messages and error messages
    - All comments in English
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [ ]* 8.2 Write property test for English field names in Lambda output (Property 5)
    - **Property 5: Lambda handler produces English-named DynamoDB items with installment metadata**
    - Test file: `back/lambdas/test/create-transaction.test.ts`
    - **Validates: Requirements 8.1, 8.4**
  - [ ]* 8.3 Write property test for sort key type values (Property 6)
    - **Property 6: Lambda sort key uses INC/EXP type values**
    - Test file: `back/lambdas/test/create-transaction.test.ts`
    - **Validates: Requirements 8.2**

- [x] 9. Checkpoint — Full synthesis and test pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Delete monolithic stack and clean up
  - [x] 10.1 Delete `infra/lib/infracore-stack.ts` and remove the old placeholder test in `infra/test/infra.test.ts`
    - Verify no remaining imports or references to `InfraCoreStack` or `InfraStack` anywhere in the codebase
    - _Requirements: 9.1, 9.2_

- [x] 11. Final checkpoint — Ensure all tests pass and CDK synth succeeds
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific resource configurations and edge cases
- The design uses TypeScript throughout — all implementation tasks use TypeScript
