#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AuthStack } from '../lib/auth-stack';
import { DataStack } from '../lib/data-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { environments } from '../config/environments';
import { projectConfig } from '../config/project-config';

const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
const envConfig = environments[envName];

if (!envConfig) {
  throw new Error(`Environment configuration for '${envName}' not found.`);
}

const prefix = projectConfig.prefixNameResources;
const cdkEnv = { account: envConfig.account, region: envConfig.region };

const authStack = new AuthStack(app, `${prefix}-auth-stack`, {
  environment: envConfig,
  projectConfig,
  env: cdkEnv,
  terminationProtection: envConfig.stage === 'prod',
});

const dataStack = new DataStack(app, `${prefix}-data-stack`, {
  environment: envConfig,
  projectConfig,
  env: cdkEnv,
  terminationProtection: true,
});

const apiStack = new ApiStack(app, `${prefix}-api-stack`, {
  environment: envConfig,
  projectConfig,
  env: cdkEnv,
  userPool: authStack.userPool,
  ledgerTable: dataStack.ledgerTable,
});

const frontendStack = new FrontendStack(app, `${prefix}-frontend-stack`, {
  environment: envConfig,
  projectConfig,
  env: cdkEnv,
  apiUrl: apiStack.restApi.url,
  cognitoDomain: `${envConfig.cognitoDomainPrefix}.auth.${envConfig.region}.amazoncognito.com`,
  oauthRedirectSignIn: envConfig.oauthCallbackUrls[0],
  oauthRedirectSignOut: envConfig.oauthLogoutUrls[0],
});

// App-level tags
cdk.Tags.of(app).add('project', projectConfig.appName);
cdk.Tags.of(app).add('environment', envConfig.stage);
cdk.Tags.of(app).add('managed-by', 'cdk');
cdk.Tags.of(app).add('cost-center', 'personal');
cdk.Tags.of(app).add('owner', 'laski');
