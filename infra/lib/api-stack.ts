import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime, RuntimeFamily } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';
import { Environment } from '../config/environments';
import { ProjectConfig } from '../config/project-config';

export interface ApiStackProps extends cdk.StackProps {
  environment: Environment;
  projectConfig: ProjectConfig;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const prefix = props.projectConfig.prefixNameResources;
    const stage = props.environment.stage;

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'api-stack');

    // REST API (v1) with CORS enabled
    const restApi = new apigateway.RestApi(this, 'RestApi', {
      restApiName: `${prefix}-api-${stage}`,
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Import Cognito User Pool from AuthStack export
    const userPool = cognito.UserPool.fromUserPoolId(
      this,
      'ImportedUserPool',
      cdk.Fn.importValue(`${prefix}-user-pool-id-${stage}`),
    );

    // Cognito User Pool Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // Lambda Function: Create Transaction
    const createTransactionHandler = new lambda.NodejsFunction(this, 'createTransactionHandler', {
      functionName: `${prefix}-createTransaction-${stage}`,
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
        TABLE_NAME: cdk.Fn.importValue(`${prefix}-ledger-table-name-${stage}`),
      },
    });

    // Grant write permissions on imported DynamoDB table
    const ledgerTable = dynamodb.Table.fromTableArn(
      this,
      'ImportedLedgerTable',
      cdk.Fn.importValue(`${prefix}-ledger-table-arn-${stage}`),
    );
    ledgerTable.grantWriteData(createTransactionHandler);

    // /transactions POST resource with Cognito authorizer
    const transactionsResource = restApi.root.addResource('transactions');
    transactionsResource.addMethod('POST', new apigateway.LambdaIntegration(createTransactionHandler), {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Cross-stack export: API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: restApi.url,
      exportName: `${prefix}-api-url-${stage}`,
    });
  }
}
