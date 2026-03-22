import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { Environment } from '../config/environments';
import { ProjectConfig } from '../config/project-config';

export interface AuthStackProps extends cdk.StackProps {
  environment: Environment;
  projectConfig: ProjectConfig;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.IUserPool;
  public readonly userPoolClient: cognito.IUserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const prefix = props.projectConfig.prefixNameResources;
    const stage = props.environment.stage;

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'auth-stack');

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-user-pool-${stage}`,
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
      deletionProtection: true,
    });

    // User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: `${prefix}-web-client-${stage}`,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      generateSecret: false,
    });

    // User Pool Domain
    new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `${prefix}-auth-${stage}`,
      },
    });

    // Expose for cross-stack references via construct props
    this.userPool = userPool;
    this.userPoolClient = userPoolClient;

    // Outputs for external consumers (CLI, frontend config)
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
  }
}
