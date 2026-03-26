import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
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
      UserPoolName: 'laskifin-user-pool',
      DeletionProtection: 'ACTIVE',
    });
  });

  test('creates User Pool Client', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'laskifin-web-client',
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
        TableName: 'laskifin-Ledger',
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
      Name: 'laskifin-api',
    });
  });

  test('creates CloudWatch log group for API access logs', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/apigateway/laskifin-api',
    });
  });

  test('creates Lambda function with Node.js 22.x runtime', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'laskifin-createTransaction',
      Runtime: 'nodejs22.x',
      MemorySize: 256,
      Timeout: 10,
    });
  });

  test('creates Cognito authorizer', () => {
    template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
  });

  // Preservation Property Test — Property 2: Existing ApiStack Resources Unchanged
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
  // Comprehensive assertion block capturing resource counts and key properties
  // to detect regressions when the bugfix is applied.
  describe('Preservation: existing ApiStack resources unchanged', () => {
    test('preserves resource counts for REST API, Log Group, Lambda, and Authorizer', () => {
      template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
      template.resourceCountIs('AWS::Logs::LogGroup', 1);
      template.resourceCountIs('AWS::Lambda::Function', 5);
      template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
    });

    test('preserves REST API laskifin-api with CORS and throttling configuration', () => {
      // REST API name
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'laskifin-api',
      });

      // Stage throttling and access logging
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        MethodSettings: [
          {
            DataTraceEnabled: false,
            HttpMethod: '*',
            ResourcePath: '/*',
            ThrottlingBurstLimit: 200,
            ThrottlingRateLimit: 100,
          },
        ],
        AccessLogSetting: {
          DestinationArn: Match.anyValue(),
          Format: Match.anyValue(),
        },
      });
    });

    test('preserves CloudWatch Log Group /aws/apigateway/laskifin-api with ONE_MONTH retention', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/laskifin-api',
        RetentionInDays: 30,
      });
    });

    test('preserves createTransaction Lambda with nodejs22.x runtime, 256 MB memory, 10s timeout', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-createTransaction',
        Runtime: 'nodejs22.x',
        MemorySize: 256,
        Timeout: 10,
      });
    });

    test('preserves Cognito authorizer (count = 1, type = COGNITO_USER_POOLS)', () => {
      template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
      template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
        Type: 'COGNITO_USER_POOLS',
      });
    });

    test('all resources tagged with stack: api-stack', () => {
      // Verify tagging on key taggable resources
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'stack', Value: 'api-stack' })]),
      });
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'stack', Value: 'api-stack' })]),
      });
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'stack', Value: 'api-stack' })]),
      });
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        Tags: Match.arrayWith([Match.objectLike({ Key: 'stack', Value: 'api-stack' })]),
      });
    });
  });

  // Bug Condition Exploration Test — Property 1: CfnAccount Resource Missing When Access Logging Enabled
  // **Validates: Requirements 1.1, 2.1, 2.2**
  // This test encodes the EXPECTED behavior after the fix.
  // It MUST FAIL on unfixed code — failure confirms the bug exists.
  describe('Bug Condition: CfnAccount and deployment dependency when access logging is enabled', () => {
    test('has CfnAccount resource with CloudWatchRoleArn', () => {
      // Assert: Template contains an AWS::ApiGateway::Account resource with CloudWatchRoleArn
      template.hasResourceProperties('AWS::ApiGateway::Account', {
        CloudWatchRoleArn: Match.anyValue(),
      });
    });

    test('has IAM role with apigateway.amazonaws.com trust and CloudWatch Logs managed policy', () => {
      // Assert: Template contains an IAM role with apigateway.amazonaws.com as service principal
      // and the AmazonAPIGatewayPushToCloudWatchLogs managed policy
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'apigateway.amazonaws.com',
              },
            },
          ],
        },
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': Match.arrayWith([
              '',
              Match.arrayWith([
                Match.stringLikeRegexp('AmazonAPIGatewayPushToCloudWatchLogs'),
              ]),
            ]),
          }),
        ]),
      });
    });

    test('API Gateway deployment stage has DependsOn relationship to CfnAccount resource', () => {
      // Assert: The API Gateway Stage resource has a DependsOn that includes
      // the CfnAccount resource logical ID.
      // CDK's deploymentStage.node.addDependency() places the dependency on the Stage,
      // ensuring CloudFormation creates the account-level logging config before the stage.
      const templateJson = template.toJSON();
      const resources = templateJson.Resources;

      // Find the AWS::ApiGateway::Account resource logical ID
      const accountLogicalIds = Object.keys(resources).filter(
        (key) => resources[key].Type === 'AWS::ApiGateway::Account'
      );
      expect(accountLogicalIds.length).toBeGreaterThan(0);

      // Find the AWS::ApiGateway::Stage resource
      const stageLogicalIds = Object.keys(resources).filter(
        (key) => resources[key].Type === 'AWS::ApiGateway::Stage'
      );
      expect(stageLogicalIds.length).toBeGreaterThan(0);

      // Assert: The stage resource has a DependsOn that includes the account resource
      const hasAccountDependency = stageLogicalIds.some((stageId) => {
        const dependsOn = resources[stageId].DependsOn;
        if (!dependsOn) return false;
        const deps = Array.isArray(dependsOn) ? dependsOn : [dependsOn];
        return deps.some((dep: string) => accountLogicalIds.includes(dep));
      });
      expect(hasAccountDependency).toBe(true);
    });
  });
});

describe('FrontendStack', () => {
  const app = new cdk.App();
  const stack = new FrontendStack(app, 'TestFrontendStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
    apiUrl: 'https://test-api.execute-api.us-west-2.amazonaws.com/prod/',
  });
  const template = Template.fromStack(stack);

  test('creates Amplify App', () => {
    template.hasResourceProperties('AWS::Amplify::App', {
      Name: 'laskifin-frontend',
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

  // Preservation Property Test — Property 2: Existing FrontendStack Resources Unchanged
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
  // Observation-first methodology: all values observed on UNFIXED code and asserted to detect regressions.
  describe('Preservation: existing FrontendStack resources unchanged', () => {
    test('preserves resource counts: 1 App, 2 Branches, 1 Domain', () => {
      template.resourceCountIs('AWS::Amplify::App', 1);
      template.resourceCountIs('AWS::Amplify::Branch', 2);
      template.resourceCountIs('AWS::Amplify::Domain', 1);
    });

    test('preserves app naming: laskifin-frontend', () => {
      template.hasResourceProperties('AWS::Amplify::App', {
        Name: 'laskifin-frontend',
      });
    });

    test('preserves buildSpec: Vite build phases with npm ci, npm run build, dist artifacts, front appRoot', () => {
      const templateJson = template.toJSON();
      const resources = templateJson.Resources;

      // Find the Amplify App resource
      const appLogicalId = Object.keys(resources).find(
        (key) => resources[key].Type === 'AWS::Amplify::App'
      );
      expect(appLogicalId).toBeDefined();

      const buildSpecRaw = resources[appLogicalId!].Properties.BuildSpec;
      // BuildSpec uses Fn::Sub, so extract the string from the Sub intrinsic
      const buildSpecStr = typeof buildSpecRaw === 'string'
        ? buildSpecRaw
        : buildSpecRaw['Fn::Sub'] || JSON.stringify(buildSpecRaw);
      const buildSpec = JSON.parse(buildSpecStr);

      // Assert Vite build phases
      const app = buildSpec.applications[0];
      expect(app.frontend.phases.preBuild.commands).toEqual(['npm ci']);
      expect(app.frontend.phases.build.commands).toEqual(['npm run build']);
      expect(app.frontend.artifacts.baseDirectory).toBe('dist');
      expect(app.frontend.artifacts.files).toEqual(['**/*']);
      expect(app.appRoot).toBe('front');
    });

    test('preserves domain mapping: appfin/main and devfin/dev on kioshitechmuta.link', () => {
      template.hasResourceProperties('AWS::Amplify::Domain', {
        DomainName: 'kioshitechmuta.link',
        SubDomainSettings: Match.arrayWith([
          Match.objectLike({ BranchName: 'main', Prefix: 'appfin' }),
          Match.objectLike({ BranchName: 'dev', Prefix: 'devfin' }),
        ]),
      });
    });

    test('preserves branch config: main PRODUCTION and dev DEVELOPMENT', () => {
      template.hasResourceProperties('AWS::Amplify::Branch', {
        BranchName: 'main',
        Stage: 'PRODUCTION',
        Framework: 'React',
      });
      template.hasResourceProperties('AWS::Amplify::Branch', {
        BranchName: 'dev',
        Stage: 'DEVELOPMENT',
        Framework: 'React',
      });
    });

    test('preserves front/.env: VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_USER_POOL_CLIENT_ID entries exist', () => {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.resolve(__dirname, '../../front/.env');
      const envContent = fs.readFileSync(envPath, 'utf-8');

      expect(envContent).toContain('VITE_COGNITO_USER_POOL_ID');
      expect(envContent).toContain('VITE_COGNITO_USER_POOL_CLIENT_ID');
    });
  });
});

// Bug Condition Exploration Test — Property 1: Amplify Branches Missing VITE_API_URL
// **Validates: Requirements 1.3, 1.4, 2.3, 2.4**
// This test encodes the EXPECTED behavior after the fix.
// It MUST FAIL on unfixed code — failure confirms the bug exists.
describe('Bug Condition: Amplify branches receive VITE_API_URL', () => {
  const app = new cdk.App();
  const stack = new FrontendStack(app, 'TestFrontendStackWithApiUrl', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
    apiUrl: 'https://test-api.execute-api.us-west-2.amazonaws.com/prod/',
  });
  const template = Template.fromStack(stack);

  test('MainBranch (PRODUCTION) has VITE_API_URL environment variable', () => {
    template.hasResourceProperties('AWS::Amplify::Branch', {
      BranchName: 'main',
      Stage: 'PRODUCTION',
      EnvironmentVariables: Match.arrayWith([
        Match.objectLike({
          Name: 'VITE_API_URL',
          Value: 'https://test-api.execute-api.us-west-2.amazonaws.com/prod/',
        }),
      ]),
    });
  });

  test('DevBranch (DEVELOPMENT) has VITE_API_URL environment variable', () => {
    template.hasResourceProperties('AWS::Amplify::Branch', {
      BranchName: 'dev',
      Stage: 'DEVELOPMENT',
      EnvironmentVariables: Match.arrayWith([
        Match.objectLike({
          Name: 'VITE_API_URL',
          Value: 'https://test-api.execute-api.us-west-2.amazonaws.com/prod/',
        }),
      ]),
    });
  });
});
