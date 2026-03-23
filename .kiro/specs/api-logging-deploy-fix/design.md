# API Gateway Logging Deployment Fix — Bugfix Design

## Overview

The `laskifin-api-stack` deployment fails because API Gateway requires an account-level CloudWatch Logs role ARN before any stage can enable access logging. The `ApiStack` configures `accessLogDestination` and `accessLogFormat` in `deployOptions`, but never sets up the `AWS::ApiGateway::Account` resource that registers the CloudWatch role at the account level. The fix adds an IAM role for `apigateway.amazonaws.com`, a `CfnAccount` resource pointing to that role, and a dependency from the API deployment/stage to the account resource so CloudFormation creates them in the correct order.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — deploying an API Gateway stage with access logging enabled without an account-level CloudWatch Logs role ARN configured via `CfnAccount`
- **Property (P)**: The desired behavior — the synthesized CloudFormation template includes an `AWS::ApiGateway::Account` resource with a `CloudWatchRoleArn`, an IAM role with `apigateway.amazonaws.com` trust, and a `DependsOn` from the deployment/stage to the account resource
- **Preservation**: Existing REST API configuration, Lambda function, Cognito authorizer, log group, CORS, throttling, and tagging must remain unchanged
- **CfnAccount**: The `AWS::ApiGateway::Account` CloudFormation resource that sets the account-level CloudWatch Logs role ARN for API Gateway
- **ApiStack**: The CDK stack in `infra/lib/api-stack.ts` that defines the REST API, Lambda integrations, and Cognito authorizer

## Bug Details

### Bug Condition

The bug manifests when the `ApiStack` is deployed with `accessLogDestination` and `accessLogFormat` in `deployOptions`. API Gateway requires an account-level CloudWatch Logs role ARN (set via `AWS::ApiGateway::Account`) before any stage can enable access logging. The stack never creates this resource, so CloudFormation rejects the stage creation.

**Formal Specification:**
```
FUNCTION isBugCondition(stack)
  INPUT: stack of type ApiStack (synthesized CloudFormation template)
  OUTPUT: boolean

  hasAccessLogging := stack.restApi.deployOptions.accessLogDestination IS NOT NULL
                      AND stack.restApi.deployOptions.accessLogFormat IS NOT NULL
  hasCfnAccount := template CONTAINS resource of type "AWS::ApiGateway::Account"
                   WITH property "CloudWatchRoleArn" IS NOT NULL

  RETURN hasAccessLogging AND NOT hasCfnAccount
END FUNCTION
```

### Examples

- **Deploy with access logging, no CfnAccount**: Stack fails with "CloudWatch Logs role ARN must be set in account settings to enable logging" — this is the current behavior
- **Deploy with access logging AND CfnAccount + IAM role**: Stack succeeds, stage is created with access logging enabled — this is the expected behavior after the fix
- **Deploy without access logging**: Stack would succeed (no CfnAccount needed) — but this is not desired since we want access logging
- **Deploy with CfnAccount but no DependsOn**: Stack may fail intermittently if CloudFormation creates the stage before the account resource — the dependency is required for reliable ordering

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The REST API named `laskifin-api` with CORS, throttling, and access logging configuration in `deployOptions` must remain identical
- The CloudWatch Log Group `/aws/apigateway/laskifin-api` must continue to exist with the same retention and removal policy
- The `createTransaction` Lambda function with DynamoDB write permissions and the `/transactions POST` endpoint with Cognito authorization must remain unchanged
- All resources must continue to be tagged with `stack: api-stack`
- Resource names must continue to use the `laskifin` prefix without stage/environment suffixes

**Scope:**
All resources and configurations that do NOT relate to the `AWS::ApiGateway::Account` and its supporting IAM role should be completely unaffected by this fix. This includes:
- REST API definition and CORS configuration
- Lambda function definition, bundling, and environment variables
- DynamoDB table permissions
- Cognito authorizer configuration
- CloudWatch Log Group for access logs
- CfnOutput for API URL

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is clear:

1. **Missing `CfnAccount` Resource**: The `ApiStack` in `infra/lib/api-stack.ts` configures `accessLogDestination` and `accessLogFormat` in `deployOptions` but never creates an `apigateway.CfnAccount` resource. API Gateway requires this account-level setting before any stage can enable CloudWatch logging.

2. **Missing IAM Role for API Gateway**: There is no IAM role with `apigateway.amazonaws.com` as the service principal and CloudWatch Logs write permissions. The `CfnAccount` resource needs this role ARN.

3. **Missing Dependency Chain**: Even after adding the `CfnAccount` and IAM role, CloudFormation may attempt to create the API Gateway stage before the account resource is ready. An explicit `DependsOn` from the API deployment (or its stage) to the `CfnAccount` resource is required to ensure correct creation order.

## Correctness Properties

Property 1: Bug Condition — CfnAccount Resource Exists With CloudWatch Role

_For any_ `ApiStack` where access logging is configured (`accessLogDestination` and `accessLogFormat` in `deployOptions`), the synthesized CloudFormation template SHALL contain an `AWS::ApiGateway::Account` resource with a `CloudWatchRoleArn` property referencing an IAM role that has `apigateway.amazonaws.com` as its service principal and the `AmazonAPIGatewayPushToCloudWatchLogs` managed policy attached.

**Validates: Requirements 2.1, 2.2**

Property 2: Bug Condition — Deployment Depends On CfnAccount

_For any_ `ApiStack` where access logging is configured, the API Gateway deployment resource SHALL have a `DependsOn` relationship to the `AWS::ApiGateway::Account` resource, ensuring CloudFormation creates the account-level logging configuration before the stage.

**Validates: Requirements 2.2**

Property 3: Preservation — Existing REST API Configuration Unchanged

_For any_ `ApiStack` after the fix, the synthesized template SHALL continue to contain the REST API named `laskifin-api`, the CloudWatch Log Group `/aws/apigateway/laskifin-api`, the `createTransaction` Lambda function with `nodejs22.x` runtime and 256 MB memory, and the Cognito authorizer — preserving all existing resource configurations.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `infra/lib/api-stack.ts`

**Function**: `ApiStack` constructor

**Specific Changes**:

1. **Add IAM import**: Import `aws-iam` module from `aws-cdk-lib`

2. **Create IAM Role for API Gateway**: Create a new `iam.Role` with:
   - Service principal: `apigateway.amazonaws.com`
   - Managed policy: `AmazonAPIGatewayPushToCloudWatchLogs` (ARN: `arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs`)

3. **Create `CfnAccount` Resource**: Create an `apigateway.CfnAccount` resource with:
   - `cloudWatchRoleArn` set to the IAM role's ARN

4. **Add Dependency**: Add a dependency from the REST API's deployment stage node to the `CfnAccount` resource node, ensuring CloudFormation creates the account resource before the stage:
   - Access the deployment stage via `this.restApi.deploymentStage.node.addDependency(apiGatewayAccount)`

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code (missing resources in synthesized template), then verify the fix adds the correct resources and preserves existing behavior. All tests use CDK `Template.fromStack()` assertions against the synthesized CloudFormation template.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the synthesized template is missing the `AWS::ApiGateway::Account` resource and the supporting IAM role.

**Test Plan**: Write CDK template assertion tests that check for the presence of `AWS::ApiGateway::Account` and the IAM role. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Missing CfnAccount Test**: Assert the template contains an `AWS::ApiGateway::Account` resource with `CloudWatchRoleArn` (will fail on unfixed code)
2. **Missing IAM Role Test**: Assert the template contains an IAM role with `apigateway.amazonaws.com` trust policy (will fail on unfixed code)
3. **Missing Dependency Test**: Assert the API Gateway deployment has a `DependsOn` to the account resource (will fail on unfixed code)

**Expected Counterexamples**:
- Template does not contain any `AWS::ApiGateway::Account` resource
- Template does not contain an IAM role with `apigateway.amazonaws.com` service principal for CloudWatch logging
- No `DependsOn` relationship exists between the deployment and account resources

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (access logging enabled without CfnAccount), the fixed stack produces a template with the required resources.

**Pseudocode:**
```
FOR ALL stack WHERE isBugCondition(stack) DO
  template := Template.fromStack(fixedStack)
  ASSERT template CONTAINS "AWS::ApiGateway::Account" WITH "CloudWatchRoleArn" IS NOT NULL
  ASSERT template CONTAINS IAM Role WITH principal "apigateway.amazonaws.com"
  ASSERT template CONTAINS managed policy "AmazonAPIGatewayPushToCloudWatchLogs"
  ASSERT deployment resource HAS DependsOn to account resource
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (existing resources unrelated to the fix), the fixed stack produces the same template resources as the original.

**Pseudocode:**
```
FOR ALL resource WHERE NOT isBugCondition(resource) DO
  ASSERT fixedTemplate.resource = originalTemplate.resource
END FOR
```

**Testing Approach**: CDK template assertions are the primary tool for preservation checking because:
- They verify the exact CloudFormation resources and properties in the synthesized template
- They catch regressions where existing resources are accidentally modified or removed
- The existing test suite already covers REST API, Log Group, Lambda, and Cognito authorizer — these tests must continue to pass

**Test Plan**: Run the existing `infra/test/stacks.test.ts` ApiStack tests on the fixed code to verify all existing assertions still pass. Add no new preservation tests beyond confirming the existing suite is green.

**Test Cases**:
1. **REST API Preservation**: Existing test `creates REST API with access logging` must continue to pass
2. **Log Group Preservation**: Existing test `creates CloudWatch log group for API access logs` must continue to pass
3. **Lambda Preservation**: Existing test `creates Lambda function with Node.js 22.x runtime` must continue to pass
4. **Cognito Authorizer Preservation**: Existing test `creates Cognito authorizer` must continue to pass

### Unit Tests

- Test that the synthesized template contains `AWS::ApiGateway::Account` with `CloudWatchRoleArn`
- Test that the template contains an IAM role with `apigateway.amazonaws.com` service principal
- Test that the IAM role has the `AmazonAPIGatewayPushToCloudWatchLogs` managed policy
- Test that the API Gateway deployment has a `DependsOn` to the account resource
- All existing ApiStack tests must continue to pass unchanged

### Property-Based Tests

- Generate `ApiStack` configurations with access logging enabled and verify the template always contains the `CfnAccount` resource with a valid `CloudWatchRoleArn`
- Verify that for any valid `ApiStack` configuration, the fix does not alter the count or properties of existing resources (REST API, Lambda, Log Group, Authorizer)

### Integration Tests

- Deploy the fixed stack to a dev environment and verify the API Gateway stage is created successfully with access logging enabled
- Verify CloudWatch Logs are being written to the `/aws/apigateway/laskifin-api` log group after making API requests
- Verify the `/transactions POST` endpoint continues to work with Cognito authorization after the fix
