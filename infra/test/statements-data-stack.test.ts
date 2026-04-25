import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { DataStack } from '../lib/data-stack';
import { ProjectConfig } from '../config/project-config';
import { Environment } from '../config/environments';

const testEnv: Environment = {
  account: '123456789012',
  region: 'us-west-2',
  stage: 'dev',
  frontendUrl: 'https://devfin.kioshitechmuta.link',
  oauthCallbackUrls: ['https://devfin.kioshitechmuta.link/auth/callback', 'http://localhost:5173/auth/callback'],
  oauthLogoutUrls: ['https://devfin.kioshitechmuta.link/login', 'http://localhost:5173/login'],
  cognitoDomainPrefix: 'laskifin-auth',
};

const testConfig: ProjectConfig = {
  appName: 'laski-finances',
  prefixNameResources: 'laskifin',
};

const cdkEnv = { account: testEnv.account, region: testEnv.region };

describe('DataStack — Statements table and import GSIs', () => {
  const app = new cdk.App();
  const stack = new DataStack(app, 'TestDataStack', {
    environment: testEnv,
    projectConfig: testConfig,
    env: cdkEnv,
  });
  const template = Template.fromStack(stack);

  test('laskifin-Statements table exists with PAY_PER_REQUEST, PITR, deletion protection, and RETAIN', () => {
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        TableName: 'laskifin-Statements',
        BillingMode: 'PAY_PER_REQUEST',
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        DeletionProtectionEnabled: true,
      }),
    });
  });

  test('laskifin-Statements has GSI_StatementsByS3Key with projection ALL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'laskifin-Statements',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI_StatementsByS3Key',
          KeySchema: Match.arrayWith([
            Match.objectLike({ AttributeName: 's3Key', KeyType: 'HASH' }),
          ]),
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    });
  });

  test('laskifin-Statements has GSI_StatementsByDocumentTypeDueDate with projection ALL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'laskifin-Statements',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI_StatementsByDocumentTypeDueDate',
          KeySchema: Match.arrayWith([
            Match.objectLike({ AttributeName: 'pk', KeyType: 'HASH' }),
            Match.objectLike({ AttributeName: 'documentTypeDueDate', KeyType: 'RANGE' }),
          ]),
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
    });
  });

  test('GSI_LedgerByImportHash exists on Ledger table with KEYS_ONLY projection', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'laskifin-Ledger',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI_LedgerByImportHash',
          KeySchema: Match.arrayWith([
            Match.objectLike({ AttributeName: 'pk', KeyType: 'HASH' }),
            Match.objectLike({ AttributeName: 'importHash', KeyType: 'RANGE' }),
          ]),
          Projection: { ProjectionType: 'KEYS_ONLY' },
        }),
      ]),
    });
  });

  test('DynamoDB table resource count matches expected (4 tables)', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 4);
  });
});
