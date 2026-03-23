# Bugfix Requirements Document

## Introduction

The `laskifin-api-stack` CloudFormation deployment fails during the creation of the `AWS::ApiGateway::Stage` resource. The error is:

> CloudWatch Logs role ARN must be set in account settings to enable logging (Service: ApiGateway, Status Code: 400)

The stack configures API Gateway access logging (`accessLogDestination` and `accessLogFormat` in `deployOptions`), but API Gateway requires an account-level CloudWatch Logs role ARN to be set before any stage can enable access logging. This account-level setting is missing, causing the deployment to fail and roll back completely.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the `ApiStack` is deployed with `accessLogDestination` and `accessLogFormat` configured in `deployOptions` THEN the system fails with error "CloudWatch Logs role ARN must be set in account settings to enable logging" during `AWS::ApiGateway::Stage` creation

1.2 WHEN the `AWS::ApiGateway::Stage` creation fails THEN the entire stack rolls back, leaving no API Gateway resources deployed

### Expected Behavior (Correct)

2.1 WHEN the `ApiStack` is deployed with `accessLogDestination` and `accessLogFormat` configured in `deployOptions` THEN the system SHALL successfully create the API Gateway stage with access logging enabled by first ensuring an account-level CloudWatch Logs role ARN is configured via an `apigateway.CfnAccount` resource

2.2 WHEN the `ApiStack` is deployed THEN the system SHALL create an IAM role with `apigateway.amazonaws.com` as the service principal, grant it CloudWatch Logs write permissions, configure it as the account-level API Gateway CloudWatch role via `CfnAccount`, and add a dependency so the API Gateway deployment depends on the `CfnAccount` resource

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `ApiStack` is deployed THEN the system SHALL CONTINUE TO create the REST API named `laskifin-api` with CORS, throttling, and access logging configured in `deployOptions`

3.2 WHEN the `ApiStack` is deployed THEN the system SHALL CONTINUE TO create the CloudWatch Log Group `/aws/apigateway/laskifin-api` for access log storage

3.3 WHEN the `ApiStack` is deployed THEN the system SHALL CONTINUE TO create the `createTransaction` Lambda function with DynamoDB write permissions and the `/transactions POST` endpoint with Cognito authorization

3.4 WHEN the `ApiStack` is deployed THEN the system SHALL CONTINUE TO tag all resources with `stack: api-stack`

3.5 WHEN the `ApiStack` is deployed THEN the system SHALL CONTINUE TO use resource names without stage/environment suffixes
