export interface Environment {
  account: string;
  region: string;
  stage: string;
  frontendUrl: string;
}

export const environments: Record<string, Environment> = {
  dev: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
    stage: 'dev',
    frontendUrl: 'https://devfin.kioshitechmuta.link',
  },
  prod: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-1',
    stage: 'prod',
    frontendUrl: 'https://appfin.kioshitechmuta.link',
  },
};
