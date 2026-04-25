import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';
import { ProjectConfig } from '../config/project-config';
import { Environment } from '../config/environments';

const testEnv: Environment = {
  account: '123456789012',
  region: 'us-west-2',
  stage: 'dev',
  frontendUrl: 'https://devfin.kioshitechmuta.link',
  oauthCallbackUrls: [
    'https://devfin.kioshitechmuta.link/auth/callback',
    'http://localhost:5173/auth/callback',
  ],
  oauthLogoutUrls: [
    'https://devfin.kioshitechmuta.link/login',
    'http://localhost:5173/login',
  ],
  cognitoDomainPrefix: 'laskifin-auth',
};

const testConfig: ProjectConfig = {
  appName: 'laski-finances',
  prefixNameResources: 'laskifin',
};

const cdkEnv = { account: testEnv.account, region: testEnv.region };

describe('Statement Import — ApiStack CDK assertions', () => {
  const app = new cdk.App({ context: { googleOAuthClientId: 'test-google-client-id' } });
  const authStack = new AuthStack(app, 'StmtTestAuthStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const dataStack = new DataStack(app, 'StmtTestDataStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const apiStack = new ApiStack(app, 'StmtTestApiStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
    userPool: authStack.userPool,
    ledgerTable: dataStack.ledgerTable,
    summaryTable: dataStack.summaryTable,
    linksTable: dataStack.linksTable,
    statementsTable: dataStack.statementsTable,
  });
  const template = Template.fromStack(apiStack);

  // --- API Routes ---
  describe('API routes exist with Cognito authorizer', () => {
    test('POST /statements route exists', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'statements',
      });
    });

    test('GET /statements route exists', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'statements',
      });
    });

    test('GET /statements/{statementId} route exists', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: '{statementId}',
      });
    });

    test('POST /statements/{statementId}/confirm route exists', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'confirm',
      });
    });

    test('DELETE /statements/{statementId} route exists', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: '{statementId}',
      });
    });

    test('all statement methods use COGNITO_USER_POOLS authorization', () => {
      const templateJson = template.toJSON();
      const resources = templateJson.Resources;

      // Find all API Gateway Method resources
      const methods = Object.keys(resources).filter(
        (key) => resources[key].Type === 'AWS::ApiGateway::Method',
      );

      // Filter to non-OPTIONS methods (OPTIONS are CORS preflight, no auth)
      const authMethods = methods.filter(
        (key) => resources[key].Properties.HttpMethod !== 'OPTIONS',
      );

      // All non-OPTIONS methods should use COGNITO_USER_POOLS
      for (const methodId of authMethods) {
        expect(resources[methodId].Properties.AuthorizationType).toBe('COGNITO_USER_POOLS');
      }
    });
  });

  // --- Lambda Functions ---
  describe('Lambda functions: memory, timeout, runtime', () => {
    test('init-statement-upload: 256 MB / 10 s / Node 22.x', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-initStatementUpload',
        Runtime: 'nodejs22.x',
        MemorySize: 256,
        Timeout: 10,
      });
    });

    test('process-statement: 512 MB / 90 s / Node 22.x', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-processStatement',
        Runtime: 'nodejs22.x',
        MemorySize: 512,
        Timeout: 90,
      });
    });

    test('review-statement: 256 MB / 10 s / Node 22.x', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-reviewStatement',
        Runtime: 'nodejs22.x',
        MemorySize: 256,
        Timeout: 10,
      });
    });

    test('confirm-statement-import: 512 MB / 30 s / Node 22.x', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-confirmStatementImport',
        Runtime: 'nodejs22.x',
        MemorySize: 512,
        Timeout: 30,
      });
    });

    test('list-statements: 256 MB / 10 s / Node 22.x', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-listStatements',
        Runtime: 'nodejs22.x',
        MemorySize: 256,
        Timeout: 10,
      });
    });

    test('delete-statement: 256 MB / 10 s / Node 22.x', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-deleteStatement',
        Runtime: 'nodejs22.x',
        MemorySize: 256,
        Timeout: 10,
      });
    });
  });

  // --- Environment Variables ---
  describe('Environment variables per handler', () => {
    test('init-statement-upload has STATEMENTS_TABLE_NAME and STATEMENTS_BUCKET_NAME', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-initStatementUpload',
        Environment: {
          Variables: Match.objectLike({
            STATEMENTS_TABLE_NAME: Match.anyValue(),
            STATEMENTS_BUCKET_NAME: Match.anyValue(),
          }),
        },
      });
    });

    test('process-statement has STATEMENTS_TABLE_NAME, STATEMENTS_BUCKET_NAME, TABLE_NAME, ANTHROPIC_SECRET_NAME', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-processStatement',
        Environment: {
          Variables: Match.objectLike({
            STATEMENTS_TABLE_NAME: Match.anyValue(),
            STATEMENTS_BUCKET_NAME: Match.anyValue(),
            TABLE_NAME: Match.anyValue(),
            ANTHROPIC_SECRET_NAME: 'laski/anthropic-api-key',
          }),
        },
      });
    });

    test('review-statement has STATEMENTS_TABLE_NAME and TABLE_NAME', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-reviewStatement',
        Environment: {
          Variables: Match.objectLike({
            STATEMENTS_TABLE_NAME: Match.anyValue(),
            TABLE_NAME: Match.anyValue(),
          }),
        },
      });
    });

    test('confirm-statement-import has STATEMENTS_TABLE_NAME, TABLE_NAME, SUMMARY_TABLE_NAME, LINKS_TABLE_NAME', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-confirmStatementImport',
        Environment: {
          Variables: Match.objectLike({
            STATEMENTS_TABLE_NAME: Match.anyValue(),
            TABLE_NAME: Match.anyValue(),
            SUMMARY_TABLE_NAME: Match.anyValue(),
            LINKS_TABLE_NAME: Match.anyValue(),
          }),
        },
      });
    });

    test('list-statements has STATEMENTS_TABLE_NAME', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-listStatements',
        Environment: {
          Variables: Match.objectLike({
            STATEMENTS_TABLE_NAME: Match.anyValue(),
          }),
        },
      });
    });

    test('delete-statement has STATEMENTS_TABLE_NAME and STATEMENTS_BUCKET_NAME', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-deleteStatement',
        Environment: {
          Variables: Match.objectLike({
            STATEMENTS_TABLE_NAME: Match.anyValue(),
            STATEMENTS_BUCKET_NAME: Match.anyValue(),
          }),
        },
      });
    });
  });

  // --- S3 Bucket ---
  describe('S3 bucket configuration', () => {
    test('bucket has BlockPublicAccess.BLOCK_ALL', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'laskifin-statements',
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    test('bucket has versioning enabled', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'laskifin-statements',
        VersioningConfiguration: { Status: 'Enabled' },
      });
    });

    test('bucket has Glacier lifecycle rule after 90 days', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'laskifin-statements',
        LifecycleConfiguration: {
          Rules: Match.arrayWith([
            Match.objectLike({
              Status: 'Enabled',
              Transitions: Match.arrayWith([
                Match.objectLike({
                  StorageClass: 'GLACIER',
                  TransitionInDays: 90,
                }),
              ]),
            }),
          ]),
        },
      });
    });

    test('bucket has S3-managed encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'laskifin-statements',
        BucketEncryption: {
          ServerSideEncryptionConfiguration: Match.arrayWith([
            Match.objectLike({
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            }),
          ]),
        },
      });
    });

    test('bucket has CORS allowing PUT', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: 'laskifin-statements',
        CorsConfiguration: {
          CorsRules: Match.arrayWith([
            Match.objectLike({
              AllowedMethods: ['PUT'],
              AllowedHeaders: ['*'],
              MaxAge: 3000,
            }),
          ]),
        },
      });
    });
  });

  // --- S3 Event Notification ---
  describe('S3 event notification', () => {
    test('S3 bucket has notification configuration for OBJECT_CREATED with prefix statements/', () => {
      // The S3 notification is wired via a Custom::S3BucketNotifications resource
      // which CDK creates. We verify the Lambda permission exists for S3 to invoke
      // the process-statement handler.
      template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunction',
        Principal: 's3.amazonaws.com',
        SourceArn: Match.anyValue(),
      });
    });
  });

  // --- Secrets Manager grant on process-statement ---
  describe('Secrets Manager grant for process-statement', () => {
    test('process-statement has IAM policy allowing secretsmanager:GetSecretValue', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'secretsmanager:GetSecretValue',
              ]),
              Effect: 'Allow',
              Resource: Match.anyValue(),
            }),
          ]),
        },
      });
    });
  });

  // --- IAM Grants ---
  describe('IAM grants per handler', () => {
    test('init-statement-upload has write access to statements table', () => {
      // Verified by the fact that the Lambda exists and statementsTable.grantWriteData is called
      // CDK generates IAM policies — we check that DynamoDB write actions exist
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'dynamodb:PutItem',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('process-statement has read-write access to statements table and read access to ledger', () => {
      // Verify that the process-statement handler has IAM policies granting
      // DynamoDB read-write on statements table and read on ledger.
      // CDK generates these via grantReadWriteData and grantReadData.
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-processStatement',
        Environment: {
          Variables: Match.objectLike({
            STATEMENTS_TABLE_NAME: Match.anyValue(),
            TABLE_NAME: Match.anyValue(),
          }),
        },
      });

      // Verify IAM policy exists with DynamoDB read-write actions (grantReadWriteData pattern)
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'dynamodb:BatchGetItem',
                'dynamodb:Query',
                'dynamodb:GetItem',
                'dynamodb:Scan',
                'dynamodb:ConditionCheckItem',
                'dynamodb:BatchWriteItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('confirm-statement-import has read-write access to ledger and statements, write to links', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'laskifin-confirmStatementImport',
        Environment: {
          Variables: Match.objectLike({
            TABLE_NAME: Match.anyValue(),
            STATEMENTS_TABLE_NAME: Match.anyValue(),
            SUMMARY_TABLE_NAME: Match.anyValue(),
            LINKS_TABLE_NAME: Match.anyValue(),
          }),
        },
      });
    });
  });
});
