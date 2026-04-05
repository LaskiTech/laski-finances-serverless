export interface Environment {
  account: string;
  region: string;
  stage: string;
  frontendUrl: string;
  oauthCallbackUrls: string[];
  oauthLogoutUrls: string[];
  cognitoDomainPrefix: string;
}

export const environments: Record<string, Environment> = {
  dev: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
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
  },
  prod: {
    account: process.env.CDK_DEFAULT_ACCOUNT || '',
    region: process.env.CDK_DEFAULT_REGION || 'us-west-1',
    stage: 'prod',
    frontendUrl: 'https://appfin.kioshitechmuta.link',
    oauthCallbackUrls: ['https://appfin.kioshitechmuta.link/auth/callback'],
    oauthLogoutUrls: ['https://appfin.kioshitechmuta.link/login'],
    cognitoDomainPrefix: 'laskifin-auth',
  },
};
