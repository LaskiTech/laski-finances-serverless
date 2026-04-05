import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import * as path from 'path';
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

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'auth-stack');

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-user-pool`,
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

    // User Pool Domain
    new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `${prefix}-auth`,
      },
    });

    // Google Identity Provider
    const googleClientId = this.node.tryGetContext('googleOAuthClientId');
    if (!googleClientId) {
      throw new Error('CDK context "googleOAuthClientId" is required. Pass it via --context googleOAuthClientId=<value>');
    }

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool,
      clientId: googleClientId,
      clientSecretValue: cdk.SecretValue.secretsManager('laski/google-oauth-client-secret'),
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
      },
    });

    // PreSignUp Lambda trigger for account linking
    const preSignUpHandler = new NodejsFunction(this, 'PreSignUpHandler', {
      functionName: `${prefix}-preSignUp`,
      entry: path.resolve(__dirname, '../../back/lambdas/src/auth/pre-sign-up.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(5),
      bundling: { minify: true, sourceMap: true },
    });

    // Grant AdminGetUser before attaching trigger to avoid circular dependency:
    // UserPool → Lambda (trigger) → IAM Policy → UserPool (Arn)
    // Use a scoped wildcard ARN to break the cycle.
    preSignUpHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [
        cdk.Arn.format({
          service: 'cognito-idp',
          resource: 'userpool',
          resourceName: '*',
        }, this),
      ],
    }));

    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignUpHandler);

    // User Pool Client with OAuth settings for Google federation
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: `${prefix}-web-client`,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.days(1),
      idTokenValidity: cdk.Duration.days(1),
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: props.environment.oauthCallbackUrls,
        logoutUrls: props.environment.oauthLogoutUrls,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });

    userPoolClient.node.addDependency(googleProvider);

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

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `${props.environment.cognitoDomainPrefix}.auth.${props.environment.region}.amazoncognito.com`,
    });
  }
}
