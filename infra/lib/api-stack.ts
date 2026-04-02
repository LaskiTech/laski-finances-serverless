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

    // Lambda Functions: CRUD Transactions
    const createTransactionHandler = this.makeLambda(
      'createTransactionHandler',
      `${prefix}-createTransaction`,
      path.resolve(__dirname, '../../back/lambdas/src/transactions/create-transaction.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
    );
    props.ledgerTable.grantWriteData(createTransactionHandler);

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
    );
    props.ledgerTable.grantReadWriteData(updateTransactionHandler);

    const deleteTransactionHandler = this.makeLambda(
      'deleteTransactionHandler',
      `${prefix}-deleteTransaction`,
      path.resolve(__dirname, '../../back/lambdas/src/transactions/delete-transaction.ts'),
      corsOrigin,
      props.ledgerTable.tableName,
    );
    props.ledgerTable.grantReadWriteData(deleteTransactionHandler);

    // /transactions resource with POST and GET methods
    const transactionsResource = this.restApi.root.addResource('transactions');
    this.cognitoMethod(transactionsResource, 'POST', createTransactionHandler, cognitoAuthorizer);
    this.cognitoMethod(transactionsResource, 'GET', listTransactionsHandler, cognitoAuthorizer);

    // /transactions/{sk} resource with GET, PUT, DELETE methods
    const transactionBySkResource = transactionsResource.addResource('{sk}');
    this.cognitoMethod(transactionBySkResource, 'GET', getTransactionHandler, cognitoAuthorizer);
    this.cognitoMethod(transactionBySkResource, 'PUT', updateTransactionHandler, cognitoAuthorizer);
    this.cognitoMethod(transactionBySkResource, 'DELETE', deleteTransactionHandler, cognitoAuthorizer);

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
