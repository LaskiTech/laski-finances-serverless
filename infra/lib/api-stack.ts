import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Construct } from 'constructs';
import { Environment } from '../config/environments';
import { ProjectConfig } from '../config/project-config';

export interface ApiStackProps extends cdk.StackProps {
  environment: Environment;
  projectConfig: ProjectConfig;
  userPool: cognito.IUserPool;
  ledgerTable: dynamodb.ITable;
}

export class ApiStack extends cdk.Stack {
  public readonly restApi: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const prefix = props.projectConfig.prefixNameResources;
    const stage = props.environment.stage;

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'api-stack');

    // Access log group for API Gateway
    const apiLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/${prefix}-api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // REST API with CORS, access logging, and throttling
    this.restApi = new apigateway.RestApi(this, 'RestApi', {
      restApiName: `${prefix}-api`,
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: stage === 'prod'
          ? ['https://appfin.kioshitechmuta.link']
          : apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Cognito User Pool Authorizer (passed via construct reference)
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
    });

    // Lambda Function: Create Transaction
    const createTransactionHandler = new lambda.NodejsFunction(this, 'createTransactionHandler', {
      functionName: `${prefix}-createTransaction`,
      entry: path.resolve(__dirname, '../../back/lambdas/src/transactions/create-transaction.ts'),
      handler: 'handler',
      runtime: new Runtime('nodejs22.x', RuntimeFamily.NODEJS),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: props.ledgerTable.tableName,
      },
    });

    // Grant write permissions via construct reference (least-privilege)
    props.ledgerTable.grantWriteData(createTransactionHandler);

    // Lambda Function: List Transactions
    const listTransactionsHandler = new lambda.NodejsFunction(this, 'listTransactionsHandler', {
      functionName: `${prefix}-listTransactions`,
      entry: path.resolve(__dirname, '../../back/lambdas/src/transactions/list-transactions.ts'),
      handler: 'handler',
      runtime: new Runtime('nodejs22.x', RuntimeFamily.NODEJS),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: props.ledgerTable.tableName,
      },
    });

    props.ledgerTable.grantReadData(listTransactionsHandler);

    // Lambda Function: Get Transaction
    const getTransactionHandler = new lambda.NodejsFunction(this, 'getTransactionHandler', {
      functionName: `${prefix}-getTransaction`,
      entry: path.resolve(__dirname, '../../back/lambdas/src/transactions/get-transaction.ts'),
      handler: 'handler',
      runtime: new Runtime('nodejs22.x', RuntimeFamily.NODEJS),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: props.ledgerTable.tableName,
      },
    });

    props.ledgerTable.grantReadData(getTransactionHandler);

    // Lambda Function: Update Transaction
    const updateTransactionHandler = new lambda.NodejsFunction(this, 'updateTransactionHandler', {
      functionName: `${prefix}-updateTransaction`,
      entry: path.resolve(__dirname, '../../back/lambdas/src/transactions/update-transaction.ts'),
      handler: 'handler',
      runtime: new Runtime('nodejs22.x', RuntimeFamily.NODEJS),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: props.ledgerTable.tableName,
      },
    });

    props.ledgerTable.grantReadWriteData(updateTransactionHandler);

    // Lambda Function: Delete Transaction
    const deleteTransactionHandler = new lambda.NodejsFunction(this, 'deleteTransactionHandler', {
      functionName: `${prefix}-deleteTransaction`,
      entry: path.resolve(__dirname, '../../back/lambdas/src/transactions/delete-transaction.ts'),
      handler: 'handler',
      runtime: new Runtime('nodejs22.x', RuntimeFamily.NODEJS),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: props.ledgerTable.tableName,
      },
    });

    props.ledgerTable.grantReadWriteData(deleteTransactionHandler);

    // /transactions resource with POST and GET methods
    const transactionsResource = this.restApi.root.addResource('transactions');
    transactionsResource.addMethod('POST', new apigateway.LambdaIntegration(createTransactionHandler), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    transactionsResource.addMethod('GET', new apigateway.LambdaIntegration(listTransactionsHandler), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // /transactions/{sk} resource with GET, PUT, DELETE methods
    const transactionBySkResource = transactionsResource.addResource('{sk}');

    transactionBySkResource.addMethod('GET', new apigateway.LambdaIntegration(getTransactionHandler), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    transactionBySkResource.addMethod('PUT', new apigateway.LambdaIntegration(updateTransactionHandler), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    transactionBySkResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteTransactionHandler), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Output for external consumers
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.restApi.url,
    });

    // IAM role for API Gateway to push logs to CloudWatch
    const apiGatewayCloudWatchRole: iam.Role = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
      ],
    });

    // Account-level setting: register the CloudWatch role for API Gateway
    const apiGatewayAccount: apigateway.CfnAccount = new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn,
    });

    // Ensure the account-level logging config is created before the API stage
    this.restApi.deploymentStage.node.addDependency(apiGatewayAccount);
  }
}
