# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** — CfnAccount Resource Missing When Access Logging Enabled
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists in the synthesized CloudFormation template
  - **Scoped PBT Approach**: Scope the property to the concrete `ApiStack` configuration with access logging enabled (the current code)
  - Test file: `infra/test/stacks.test.ts`
  - Synthesize the `ApiStack` template and assert:
    - Template contains an `AWS::ApiGateway::Account` resource with a `CloudWatchRoleArn` property (from `isBugCondition` — `hasCfnAccount` is false)
    - Template contains an IAM role with `apigateway.amazonaws.com` as service principal and `AmazonAPIGatewayPushToCloudWatchLogs` managed policy
    - The API Gateway deployment resource has a `DependsOn` relationship to the `AWS::ApiGateway::Account` resource
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists: no `CfnAccount`, no IAM role, no dependency)
  - Document counterexamples found (e.g., "Template has 0 `AWS::ApiGateway::Account` resources", "No IAM role with apigateway.amazonaws.com trust")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Existing ApiStack Resources Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `infra/test/stacks.test.ts`
  - Observe on UNFIXED code and write property-based assertions that:
    - REST API `laskifin-api` exists with expected CORS and throttling configuration
    - CloudWatch Log Group `/aws/apigateway/laskifin-api` exists with `ONE_MONTH` retention
    - `createTransaction` Lambda function exists with `nodejs22.x` runtime, 256 MB memory, 10s timeout
    - Cognito authorizer exists (resource count = 1)
    - All resources tagged with `stack: api-stack`
    - Resource counts for REST API (1), Log Group (1), Lambda (1), Authorizer (1) are preserved
  - Note: existing tests in `stacks.test.ts` already cover some of these — add a dedicated preservation test that captures resource counts and key properties as a single comprehensive assertion block
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for API Gateway deployment failure due to missing CfnAccount

  - [x] 3.1 Implement the fix in `infra/lib/api-stack.ts`
    - Add `import * as iam from 'aws-cdk-lib/aws-iam'` to imports
    - Create an IAM role with `apigateway.amazonaws.com` as service principal
    - Attach managed policy `arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs` to the role
    - Create `apigateway.CfnAccount` resource with `cloudWatchRoleArn` set to the IAM role's ARN
    - Add dependency: `this.restApi.deploymentStage.node.addDependency(apiGatewayAccount)` to ensure correct CloudFormation creation order
    - _Bug_Condition: isBugCondition(stack) where hasAccessLogging AND NOT hasCfnAccount_
    - _Expected_Behavior: Template contains AWS::ApiGateway::Account with CloudWatchRoleArn, IAM role with apigateway.amazonaws.com trust, and DependsOn from deployment to account_
    - _Preservation: REST API, Log Group, Lambda, Cognito authorizer, CORS, throttling, tagging all unchanged_
    - _Requirements: 1.1, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — CfnAccount Resource Exists With CloudWatch Role
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** — Existing ApiStack Resources Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all existing ApiStack tests and new preservation tests still pass after fix
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run `cd infra && npx jest` to execute the full test suite
  - Ensure all tests pass, ask the user if questions arise
