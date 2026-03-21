import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Environment } from '../config/environments';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

interface StackEnvironmentProps extends cdk.StackProps {
  environment: Environment;
}

export class InfraCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackEnvironmentProps) {
    super(scope, id, props);

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'LaskiUserPool', {
      userPoolName: `laski-user-pool-${props.environment.stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
    });

    // App Client
    const userPoolClient = new cognito.UserPoolClient(this, 'LaskiUserPoolWebClient', {
      userPool,
      userPoolClientName: `laski-web-client-${props.environment.stage}`,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      generateSecret: false,
    });

    // Custom Domain
    const userPoolDomain = new cognito.UserPoolDomain(this, 'LaskiUserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `laski-auth-${props.environment.stage}`,
      },
    });


    // DinamoDB Table
    // O nome 'LaskiLedger' remete ao livro contábil de registros
    const ledgerTable = new dynamodb.Table(this, 'laskifin-Ledger', {
      tableName: 'laskifin-Ledger', 
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING }, // USER#<ID>
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },      // TYPE#DATE#ID
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      pointInTimeRecovery: true,
    });


    // GSI para RN5: Permite filtrar por fonte (Cartão, Banco, etc) 
    // sem precisar saber o mês/ano na Partition Key
    ledgerTable.addGlobalSecondaryIndex({
      indexName: 'GSI_LookupBySource',
      partitionKey: { name: 'fonte', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });


    // Lambda Function: Create Transaction
    const createTransactionFn = new lambda.NodejsFunction(this, 'createTransactionHandler', {
      functionName: 'laskifin-createTransaction',
      entry: path.resolve(__dirname, '../../back/lambdas/src/transactions/create-transaction.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: ledgerTable.tableName,
      },
    });
    // Grant Permission (Princípio do menor privilégio)
    ledgerTable.grantWriteData(createTransactionFn);


    // Output User Pool ID and Client ID
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
    });

    new cdk.CfnOutput(this, 'LedgerTableName', {
      value: ledgerTable.tableName,
      description: 'DynamoDB Ledger Table Name',
    });

    new cdk.CfnOutput(this, 'CreateTransactionFunctionName', {
      value: createTransactionFn.functionName,
      description: 'Lambda Function Name for Creating Transactions',
    });
  }
}
