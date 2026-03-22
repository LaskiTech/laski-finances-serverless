import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { Environment } from '../config/environments';
import { ProjectConfig } from '../config/project-config';

export interface FrontendStackProps extends cdk.StackProps {
  environment: Environment;
  projectConfig: ProjectConfig;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const prefix = props.projectConfig.prefixNameResources;
    const stage = props.environment.stage;

    // Stack-level tag
    cdk.Tags.of(this).add('stack', 'frontend-stack');

    // Amplify App (L1 construct for stability)
    const amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: `${prefix}-frontend-${stage}`,
    });

    // Branch: main
    const mainBranch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
    });

    // Branch: dev
    const devBranch = new amplify.CfnBranch(this, 'DevBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'dev',
    });

    // Look up existing hosted zone — never create a new one
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'kioshitechmuta.link',
    });

    // Custom domain mapping
    const domain = new amplify.CfnDomain(this, 'AmplifyDomain', {
      appId: amplifyApp.attrAppId,
      domainName: 'kioshitechmuta.link',
      subDomainSettings: [
        {
          branchName: mainBranch.branchName,
          prefix: 'appfin',
        },
        {
          branchName: devBranch.branchName,
          prefix: 'devfin',
        },
      ],
    });

    // Ensure domain is created after branches
    domain.addDependency(mainBranch);
    domain.addDependency(devBranch);
  }
}
