const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [import.meta.env.VITE_OAUTH_REDIRECT_SIGN_IN],
          redirectSignOut: [import.meta.env.VITE_OAUTH_REDIRECT_SIGN_OUT],
          responseType: 'code' as const,
        },
      },
    },
  },
};

export default amplifyConfig;
