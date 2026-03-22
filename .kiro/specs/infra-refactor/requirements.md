# Requirements Document

## Introduction

Refactor the LASKI Finances CDK infrastructure from a single monolithic stack (`InfraCoreStack`) into the four-stack architecture defined in `architecture.md`: `AuthStack`, `DataStack`, `ApiStack`, and `FrontendStack`. This includes aligning all resource naming with `projectConfig`, fixing dependency versions, updating runtimes, adding API Gateway, migrating Portuguese field names to English, and establishing cross-stack references via `CfnOutput` exports.

## Glossary

- **CDK_App**: The AWS CDK application entry point defined in `infra/bin/infra.ts` that instantiates all stacks
- **AuthStack**: CDK stack responsible for Cognito User Pool, User Pool Client, and User Pool Domain
- **DataStack**: CDK stack responsible for DynamoDB tables and Global Secondary Indexes
- **ApiStack**: CDK stack responsible for API Gateway REST API, Lambda functions, and IAM roles
- **FrontendStack**: CDK stack responsible for AWS Amplify Hosting, branch config, and custom domain
- **ProjectConfig**: Configuration object in `infra/config/project-config.ts` providing `appName` and `prefixNameResources` for consistent resource naming
- **Environment**: Configuration object in `infra/config/environments.ts` providing `account`, `region`, and `stage` per deployment target
- **Ledger_Table**: The DynamoDB table `laskifin-Ledger` storing all financial transactions
- **GSI_LookupBySource**: Global Secondary Index on the Ledger Table for querying transactions by payment source
- **Create_Transaction_Lambda**: The Lambda function handling transaction creation at `back/lambdas/src/transactions/create-transaction.ts`
- **Cross_Stack_Ref**: A `CfnOutput` export from one stack that another stack imports via `Fn.importValue`

## Requirements

### Requirement 1: Split Monolithic Stack into AuthStack

**User Story:** As a developer, I want authentication resources isolated in their own stack, so that I can deploy and manage Cognito independently from other infrastructure.

#### Acceptance Criteria

1. WHEN the CDK_App is synthesized, THE AuthStack SHALL create a Cognito User Pool named using `${ProjectConfig.prefixNameResources}-user-pool-${Environment.stage}`
2. WHEN the CDK_App is synthesized, THE AuthStack SHALL create a Cognito User Pool Client named using `${ProjectConfig.prefixNameResources}-web-client-${Environment.stage}`
3. WHEN the CDK_App is synthesized, THE AuthStack SHALL create a Cognito User Pool Domain with prefix `${ProjectConfig.prefixNameResources}-auth-${Environment.stage}`
4. THE AuthStack SHALL export the User Pool ID and User Pool Client ID as `CfnOutput` values for consumption by other stacks
5. THE AuthStack SHALL configure the User Pool with email-based sign-in, self-sign-up enabled, and password policy requiring minimum 8 characters with lowercase, uppercase, digits, and symbols
6. THE AuthStack SHALL configure account recovery to email-only

### Requirement 2: Split Monolithic Stack into DataStack

**User Story:** As a developer, I want data resources isolated in their own stack, so that I can manage DynamoDB tables independently and share references with other stacks.

#### Acceptance Criteria

1. WHEN the CDK_App is synthesized, THE DataStack SHALL create the Ledger_Table with partition key `pk` (STRING) and sort key `sk` (STRING), using PAY_PER_REQUEST billing and point-in-time recovery enabled
2. WHEN the CDK_App is synthesized, THE DataStack SHALL create the GSI_LookupBySource index with partition key `source` (STRING) and sort key `sk` (STRING), using ALL projection
3. THE DataStack SHALL export the Ledger_Table name and ARN as `CfnOutput` values for consumption by other stacks
4. THE DataStack SHALL use the English field name `source` instead of the Portuguese field name `fonte` for the GSI partition key

### Requirement 3: Create ApiStack with API Gateway and Lambda Functions

**User Story:** As a developer, I want an API layer with API Gateway and Lambda functions in a dedicated stack, so that the REST API is properly defined with Cognito authorization and can be deployed independently.

#### Acceptance Criteria

1. WHEN the CDK_App is synthesized, THE ApiStack SHALL create a REST API (API Gateway v1) named `${ProjectConfig.prefixNameResources}-api-${Environment.stage}`
2. WHEN the CDK_App is synthesized, THE ApiStack SHALL create a Cognito User Pool Authorizer on the REST API using the User Pool ID imported from AuthStack
3. WHEN the CDK_App is synthesized, THE ApiStack SHALL create the Create_Transaction_Lambda with runtime `NODEJS_22_X`, memory size 256 MB, timeout 10 seconds, and esbuild bundling options `minify: true` and `sourceMap: true`
4. THE ApiStack SHALL grant write-only permissions on the Ledger_Table to the Create_Transaction_Lambda using the table ARN imported from DataStack
5. THE ApiStack SHALL pass the Ledger_Table name (imported from DataStack) as the `TABLE_NAME` environment variable to the Create_Transaction_Lambda
6. THE ApiStack SHALL export the REST API URL as a `CfnOutput` value

### Requirement 4: Create FrontendStack for Amplify Hosting

**User Story:** As a developer, I want a dedicated stack for frontend hosting, so that Amplify deployment configuration is managed as infrastructure-as-code.

#### Acceptance Criteria

1. WHEN the CDK_App is synthesized, THE FrontendStack SHALL create an Amplify App named `${ProjectConfig.prefixNameResources}-frontend-${Environment.stage}`
2. THE FrontendStack SHALL configure branch-based deployments: `main` branch mapped to `appfin.kioshitechmuta.link` and `dev` branch mapped to `devfin.kioshitechmuta.link`
3. THE FrontendStack SHALL use `route53.HostedZone.fromLookup` to reference the existing `kioshitechmuta.link` hosted zone, and SHALL NOT create a new hosted zone

### Requirement 5: Update CDK Entry Point for Multi-Stack Orchestration

**User Story:** As a developer, I want the CDK entry point to instantiate all four stacks in the correct dependency order, so that cross-stack references resolve correctly during deployment.

#### Acceptance Criteria

1. WHEN the CDK_App is synthesized, THE CDK_App SHALL instantiate AuthStack, DataStack, ApiStack, and FrontendStack in that dependency order
2. THE CDK_App SHALL pass the Environment configuration and ProjectConfig to each stack
3. THE CDK_App SHALL add explicit CDK dependencies so that AuthStack deploys before ApiStack, DataStack deploys before ApiStack, and ApiStack deploys before FrontendStack
4. THE CDK_App SHALL remove the old `InfraCoreStack` instantiation entirely

### Requirement 6: Fix Dependency Versions and Workspace Configuration

**User Story:** As a developer, I want all dependency versions pinned exactly and workspace paths correct, so that builds are reproducible and the monorepo structure works reliably.

#### Acceptance Criteria

1. THE root `package.json` SHALL use exact versions (no `^` or `~` prefixes) for `aws-cdk`, `aws-cdk-lib`, `constructs`, `esbuild`, `ts-node`, and `typescript`
2. THE root `package.json` SHALL reference the infra workspace as `infra/*` (lowercase) instead of `Infra/*`
3. THE `infra/package.json` SHALL use `aws-cdk-lib` version `2.244.0` and `constructs` with an exact version (no `^` prefix)
4. THE root `package.json` SHALL set `aws-cdk` and `aws-cdk-lib` to version `2.244.0`
5. THE root `package.json` SHALL include an `engines` field specifying `"node": ">=22.0.0"`

### Requirement 7: Fix Environment Configuration

**User Story:** As a developer, I want the environment configuration to match the architecture specification, so that deployments target the correct AWS regions.

#### Acceptance Criteria

1. THE Environment configuration SHALL set the `prod` region to `us-west-1` instead of `us-east-1`

### Requirement 8: Migrate Lambda Handler to English Field Names

**User Story:** As a developer, I want the Lambda handler code to use English field names consistently, so that it aligns with the domain language standard and the updated DynamoDB schema.

#### Acceptance Criteria

1. THE Create_Transaction_Lambda handler SHALL use the English field names: `description`, `totalAmount`, `installments`, `date`, `category`, `source`, `type` instead of the Portuguese equivalents `descricao`, `valorTotal`, `parcelas`, `data`, `categoria`, `fonte`, `tipo`
2. THE Create_Transaction_Lambda handler SHALL use transaction type values `INC` and `EXP` instead of `REC` and `DESP` in the sort key pattern
3. THE Create_Transaction_Lambda handler SHALL return English response messages instead of Portuguese
4. THE Create_Transaction_Lambda handler SHALL include `installmentNumber`, `installmentTotal`, and `totalAmount` fields on each installment entry per business rule BR5

### Requirement 9: Delete Monolithic Stack File

**User Story:** As a developer, I want the old monolithic stack file removed, so that the codebase has no dead code or ambiguity about which stack definitions are active.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE file `infra/lib/infracore-stack.ts` SHALL be deleted
2. WHEN the refactoring is complete, THE CDK_App SHALL contain no references to `InfraCoreStack` or `InfraStack`


### Requirement 10: Apply Resource Tagging Strategy

**User Story:** As a developer, I want all AWS resources tagged consistently for observability, cost tracking, and operational clarity, so that I can filter resources by project, environment, and owning stack in Cost Explorer, billing reports, and troubleshooting workflows.

#### Acceptance Criteria

1. WHEN the CDK_App is synthesized, THE CDK_App SHALL apply the `project` tag with value `projectConfig.appName` to all resources via `cdk.Tags.of(app).add(...)`
2. WHEN the CDK_App is synthesized, THE CDK_App SHALL apply the `environment` tag with value `environment.stage` to all resources via `cdk.Tags.of(app).add(...)`
3. WHEN the CDK_App is synthesized, THE CDK_App SHALL apply the `managed-by` tag with value `cdk` to all resources via `cdk.Tags.of(app).add(...)`
4. WHEN the CDK_App is synthesized, THE CDK_App SHALL apply the `cost-center` tag with value `personal` to all resources via `cdk.Tags.of(app).add(...)`
5. WHEN the CDK_App is synthesized, THE CDK_App SHALL apply the `owner` tag with value `laski` to all resources via `cdk.Tags.of(app).add(...)`
6. THE AuthStack SHALL apply the `stack` tag with value `auth-stack` inside its constructor via `cdk.Tags.of(this).add(...)`
7. THE DataStack SHALL apply the `stack` tag with value `data-stack` inside its constructor via `cdk.Tags.of(this).add(...)`
8. THE ApiStack SHALL apply the `stack` tag with value `api-stack` inside its constructor via `cdk.Tags.of(this).add(...)`
9. THE FrontendStack SHALL apply the `stack` tag with value `frontend-stack` inside its constructor via `cdk.Tags.of(this).add(...)`
10. THE CDK_App SHALL ensure all tag values are lowercase and use hyphens for multi-word values
