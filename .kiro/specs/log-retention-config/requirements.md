# Requirements Document

## Introduction

Configure CloudWatch Log Group retention to 1 week (7 days) across all CDK stacks to minimize log storage costs during the preview phase of the application. This applies to both explicitly created log groups and implicitly created log groups (e.g., Lambda function log groups auto-created by CDK).

## Glossary

- **Log_Retention_Policy**: The CloudWatch Logs retention setting that controls how long log events are kept before automatic deletion.
- **Explicit_Log_Group**: A CloudWatch Log Group created directly via `logs.LogGroup` in CDK code (e.g., the API Gateway access log group in ApiStack).
- **Implicit_Log_Group**: A CloudWatch Log Group automatically created by AWS when a Lambda function is invoked, unless a log group is explicitly defined in CDK.
- **ApiStack**: The CDK stack containing API Gateway, Lambda functions, and IAM roles.
- **AuthStack**: The CDK stack containing Cognito User Pool, Client, and Domain.
- **DataStack**: The CDK stack containing DynamoDB tables and GSIs.
- **FrontendStack**: The CDK stack containing Amplify App, branch config, and custom domain.
- **NodejsFunction**: The CDK L2 construct used to define Lambda functions with esbuild bundling.

## Requirements

### Requirement 1: Set explicit log group retention to 1 week

**User Story:** As a developer, I want the API Gateway access log group retention set to 1 week, so that log storage costs are minimized during the preview phase.

#### Acceptance Criteria

1. THE ApiStack SHALL set the API Gateway access log group retention to `logs.RetentionDays.ONE_WEEK` (7 days).
2. WHEN the ApiStack is synthesized, THE API Gateway access log group SHALL have a retention period of 7 days.

### Requirement 2: Set Lambda function log group retention to 1 week

**User Story:** As a developer, I want all Lambda function log groups to have a 1-week retention, so that Lambda execution logs do not accumulate indefinitely and incur unnecessary storage costs.

#### Acceptance Criteria

1. THE ApiStack SHALL define explicit CloudWatch Log Groups with `logs.RetentionDays.ONE_WEEK` retention for each Lambda function.
2. WHEN a Lambda function log group is explicitly defined, THE NodejsFunction construct SHALL reference the explicit log group via the `logGroup` property.
3. THE explicitly created Lambda log groups SHALL use the naming convention `/aws/lambda/<functionName>` to match the standard AWS Lambda log group naming.
4. THE explicitly created Lambda log groups SHALL have `removalPolicy` set to `cdk.RemovalPolicy.DESTROY` to allow cleanup on stack deletion.

### Requirement 3: Ensure all log groups across all stacks use 1-week retention

**User Story:** As a developer, I want a single, consistent retention policy across all stacks, so that no log group is accidentally left with a longer (or infinite) retention.

#### Acceptance Criteria

1. THE ApiStack SHALL configure all CloudWatch Log Groups (API Gateway access logs and Lambda function logs) with `logs.RetentionDays.ONE_WEEK`.
2. THE AuthStack, DataStack, and FrontendStack SHALL remain unchanged because they do not create CloudWatch Log Groups directly (Cognito, DynamoDB, and Amplify manage their own logging outside CDK control).
3. WHEN a new Lambda function or log group is added to any stack in the future, THE developer SHALL set the retention to `logs.RetentionDays.ONE_WEEK` to maintain consistency.
