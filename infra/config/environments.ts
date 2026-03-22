export interface Environment {
  account: string;
  region: string;
  stage: string;
}

export const environments: Record<string, Environment> = {
  dev: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
    stage: 'dev',
  },
  prod: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-1',
    stage: 'prod',
  },
};
