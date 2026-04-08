import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
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
  summaryTable: dynamodb.ITable;
  linksTable: dynamodb.ITable;
}

export class ApiStack extends cdk.Stack {
  public readonly restApi: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const prefix = props.projectConfig.prefixNameResources;
    const stage = props.environment.stage;
    const corsOrigin = stage === 'prod' ? props.environment.frontendUrl : '*';

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'api-stack');

    // Access log group for API Gateway
    const apiLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/${prefix}-api`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // REST API with CORS, access logging, throttling, and managed CloudWatch role
    this.restApi = new apigateway.RestApi(this, 'RestApi', {
      restApiName: `${prefix}-api`,
      cloudWatchRole: true,
      deployOptions: {
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: stage === 'prod'
          ? [props.environment.frontendUrl]
          : apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Cognito User Pool Authorizer (passed via construct reference)
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
    });

    const summaryEnv = { SUMMARY_TABLE_NAME: props.summaryTable.tableName };

    // --- Lambda Functions: CRUD Transactions ---
    const createTransactionHandler = this.makeLambda(
      'createTransactionHandler',
      `${prefix}-createTransaction`,
      path.resolve(__dirname, '../../back/lambdas/src/transactions/create-transaction.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      summaryEnv,
    );
    props.ledgerTable.grantWriteData(createTransactionHandler);
    props.summaryTable.grantWriteData(createTransactionHandler);

    const listTransactionsHandler = this.makeLambda(
      'listTransactionsHandler',
      `${prefix}-listTransactions`,
      path.resolve(__dirname, '../../back/lambdas/src/transactions/list-transactions.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
    );
    props.ledgerTable.grantReadData(listTransactionsHandler);

    const getTransactionHandler = this.makeLambda(
      'getTransactionHandler',
      `${prefix}-getTransaction`,
      path.resolve(__dirname, '../../back/lambdas/src/transactions/get-transaction.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
    );
    props.ledgerTable.grantReadData(getTransactionHandler);

    const updateTransactionHandler = this.makeLambda(
      'updateTransactionHandler',
      `${prefix}-updateTransaction`,
      path.resolve(__dirname, '../../back/lambdas/src/transactions/update-transaction.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      summaryEnv,
    );
    props.ledgerTable.grantReadWriteData(updateTransactionHandler);
    props.summaryTable.grantReadWriteData(updateTransactionHandler);

    const deleteTransactionHandler = this.makeLambda(
      'deleteTransactionHandler',
      `${prefix}-deleteTransaction`,
      path.resolve(__dirname, '../../back/lambdas/src/transactions/delete-transaction.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      summaryEnv,
    );
    props.ledgerTable.grantReadWriteData(deleteTransactionHandler);
    props.summaryTable.grantReadWriteData(deleteTransactionHandler);

    // /transactions resource
    const transactionsResource = this.restApi.root.addResource('transactions');
    this.cognitoMethod(transactionsResource, 'POST', createTransactionHandler, cognitoAuthorizer);
    this.cognitoMethod(transactionsResource, 'GET', listTransactionsHandler, cognitoAuthorizer);

    const transactionBySkResource = transactionsResource.addResource('{sk}');
    this.cognitoMethod(transactionBySkResource, 'GET', getTransactionHandler, cognitoAuthorizer);
    this.cognitoMethod(transactionBySkResource, 'PUT', updateTransactionHandler, cognitoAuthorizer);
    this.cognitoMethod(transactionBySkResource, 'DELETE', deleteTransactionHandler, cognitoAuthorizer);

    // --- Lambda Functions: CRUD Income ---
    const createIncomeHandler = this.makeLambda(
      'createIncomeHandler',
      `${prefix}-createIncome`,
      path.resolve(__dirname, '../../back/lambdas/src/income/create-income.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      summaryEnv,
    );
    props.ledgerTable.grantWriteData(createIncomeHandler);
    props.summaryTable.grantWriteData(createIncomeHandler);

    const listIncomeHandler = this.makeLambda(
      'listIncomeHandler',
      `${prefix}-listIncome`,
      path.resolve(__dirname, '../../back/lambdas/src/income/list-income.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
    );
    props.ledgerTable.grantReadData(listIncomeHandler);

    const getIncomeHandler = this.makeLambda(
      'getIncomeHandler',
      `${prefix}-getIncome`,
      path.resolve(__dirname, '../../back/lambdas/src/income/get-income.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
    );
    props.ledgerTable.grantReadData(getIncomeHandler);

    const updateIncomeHandler = this.makeLambda(
      'updateIncomeHandler',
      `${prefix}-updateIncome`,
      path.resolve(__dirname, '../../back/lambdas/src/income/update-income.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      summaryEnv,
    );
    props.ledgerTable.grantReadWriteData(updateIncomeHandler);
    props.summaryTable.grantReadWriteData(updateIncomeHandler);

    const deleteIncomeHandler = this.makeLambda(
      'deleteIncomeHandler',
      `${prefix}-deleteIncome`,
      path.resolve(__dirname, '../../back/lambdas/src/income/delete-income.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      summaryEnv,
    );
    props.ledgerTable.grantReadWriteData(deleteIncomeHandler);
    props.summaryTable.grantReadWriteData(deleteIncomeHandler);

    // /income resource
    const incomeResource = this.restApi.root.addResource('income');
    this.cognitoMethod(incomeResource, 'POST', createIncomeHandler, cognitoAuthorizer);
    this.cognitoMethod(incomeResource, 'GET', listIncomeHandler, cognitoAuthorizer);

    const incomeBySkResource = incomeResource.addResource('{sk}');
    this.cognitoMethod(incomeBySkResource, 'GET', getIncomeHandler, cognitoAuthorizer);
    this.cognitoMethod(incomeBySkResource, 'PUT', updateIncomeHandler, cognitoAuthorizer);
    this.cognitoMethod(incomeBySkResource, 'DELETE', deleteIncomeHandler, cognitoAuthorizer);

    // --- Lambda Functions: Links ---
    const linksEnv = { LINKS_TABLE_NAME: props.linksTable.tableName };

    const createLinkHandler = this.makeLambda(
      'createLinkHandler',
      `${prefix}-createLink`,
      path.resolve(__dirname, '../../back/lambdas/src/links/create-link.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      linksEnv,
    );
    props.ledgerTable.grantReadData(createLinkHandler);
    props.linksTable.grantWriteData(createLinkHandler);

    const listLinksHandler = this.makeLambda(
      'listLinksHandler',
      `${prefix}-listLinks`,
      path.resolve(__dirname, '../../back/lambdas/src/links/list-links.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      linksEnv,
    );
    props.ledgerTable.grantReadData(listLinksHandler);
    props.linksTable.grantReadData(listLinksHandler);

    const deleteLinkHandler = this.makeLambda(
      'deleteLinkHandler',
      `${prefix}-deleteLink`,
      path.resolve(__dirname, '../../back/lambdas/src/links/delete-link.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
      linksEnv,
    );
    props.linksTable.grantReadWriteData(deleteLinkHandler);

    // /links resource
    const linksResource = this.restApi.root.addResource('links');
    this.cognitoMethod(linksResource, 'POST', createLinkHandler, cognitoAuthorizer);
    this.cognitoMethod(linksResource, 'GET', listLinksHandler, cognitoAuthorizer);

    const linkByIdResource = linksResource.addResource('{linkId}');
    this.cognitoMethod(linkByIdResource, 'DELETE', deleteLinkHandler, cognitoAuthorizer);

    // --- Lambda Function: Balance ---
    const getBalanceHandler = new lambda.NodejsFunction(this, 'GetBalanceHandler', {
      entry: path.resolve(__dirname, '../../back/lambdas/src/balance/get-balance.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        SUMMARY_TABLE_NAME: props.summaryTable.tableName,
        CORS_ORIGIN: corsOrigin,
      },
    });
    props.summaryTable.grantReadData(getBalanceHandler);

    // /balance resource
    const balanceResource = this.restApi.root.addResource('balance');
    this.cognitoMethod(balanceResource, 'GET', getBalanceHandler, cognitoAuthorizer);

    // Output for external consumers
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.restApi.url,
    });
  }

  private makeLambda(
    id: string,
    functionName: string,
    entry: string,
    corsOrigin: string,
    tableName: string,
    additionalEnv?: Record<string, string>,
  ): lambda.NodejsFunction {
    return new lambda.NodejsFunction(this, id, {
      functionName,
      entry,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: true,
      },
      environment: {
        TABLE_NAME: tableName,
        CORS_ORIGIN: corsOrigin,
        ...additionalEnv,
      },
    });
  }

  private cognitoMethod(
    resource: apigateway.Resource,
    httpMethod: string,
    handler: lambda.NodejsFunction,
    authorizer: apigateway.CognitoUserPoolsAuthorizer,
  ): void {
    resource.addMethod(
      httpMethod,
      new apigateway.LambdaIntegration(handler),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );
  }
}
