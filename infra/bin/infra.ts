#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { InfraCoreStack } from '../lib/infracore-stack';
import { environments } from '../config/environments';

const app = new cdk.App();
const envName = app.node.tryGetContext('env') || 'dev';
const envConfig = environments[envName];

if (!envConfig) {
  throw new Error(`Environment configuration for '${envName}' not found.`);
}

new InfraCoreStack(app, 'InfraStack', {
  environment:envConfig,
});
