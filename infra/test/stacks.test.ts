import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { ProjectConfig } from '../config/project-config';
import { Environment } from '../config/environments';

const testEnv: Environment = {
  account: '123456789012',
  region: 'us-west-2',
  stage: 'dev',
};

const testConfig: ProjectConfig = {
  appName: 'laski-finances',
  prefixNameResources: 'laskifin',
};

const cdkEnv = { account: testEnv.account, region: testEnv.region };

describe('AuthStack', () => {
  const app = new cdk.App();
  const stack = new AuthStack(app, 'TestAuthStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const template = Template.fromStack(stack);

  test('creates Cognito User Pool with deletion protection', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'laskifin-user-pool-dev',
      DeletionProtection: 'ACTIVE',
    });
  });

  test('creates User Pool Client', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'laskifin-web-client-dev',
      GenerateSecret: false,
    });
  });

  test('creates User Pool Domain', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
  });
});

describe('DataStack', () => {
  const app = new cdk.App();
  const stack = new DataStack(app, 'TestDataStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const template = Template.fromStack(stack);

  test('creates DynamoDB table with RETAIN removal policy and deletion protection', () => {
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        TableName: 'laskifin-Ledger-dev',
        BillingMode: 'PAY_PER_REQUEST',
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        DeletionProtectionEnabled: true,
      },
    });
  });

  test('creates GSI for source lookup', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI_LookupBySource',
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    });
  });

  test('exposes ledgerTable as public property', () => {
    expect(stack.ledgerTable).toBeDefined();
    expect(stack.ledgerTable.tableName).toBeDefined();
  });
});

describe('ApiStack', () => {
  const app = new cdk.App();
  const authStack = new AuthStack(app, 'TestAuthStack2', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const dataStack = new DataStack(app, 'TestDataStack2', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const stack = new ApiStack(app, 'TestApiStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
    userPool: authStack.userPool,
    ledgerTable: dataStack.ledgerTable,
  });
  const template = Template.fromStack(stack);

  test('creates REST API with access logging', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'laskifin-api-dev',
    });
  });

  test('creates CloudWatch log group for API access logs', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/apigateway/laskifin-api-dev',
    });
  });

  test('creates Lambda function with Node.js 22.x runtime', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'laskifin-createTransaction-dev',
      Runtime: 'nodejs22.x',
      MemorySize: 256,
      Timeout: 10,
    });
  });

  test('creates Cognito authorizer', () => {
    template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
  });
});

describe('FrontendStack', () => {
  const app = new cdk.App();
  const stack = new FrontendStack(app, 'TestFrontendStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const template = Template.fromStack(stack);

  test('creates Amplify App', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      Name: 'laskifin-frontend-dev',
    });
  });

  test('creates main and dev branches', () => {
    template.resourceCountIs('AWS::Amplify::Branch', 2);
    template.hasResourceProperties('AWS::Amplify::Branch', {
      BranchName: 'main',
      Stage: 'PRODUCTION',
    });
    template.hasResourceProperties('AWS::Amplify::Branch', {
      BranchName: 'dev',
      Stage: 'DEVELOPMENT',
    });
  });

  test('creates custom domain', () => {
    template.hasResourceProperties('AWS::Amplify::Domain', {
      DomainName: 'kioshitechmuta.link',
    });
  });
});
