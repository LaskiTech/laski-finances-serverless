import type { PreSignUpTriggerHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});

export const handler: PreSignUpTriggerHandler = async (event) => {
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') {
    return event;
  }

  const email = event.request.userAttributes['email'];
  if (!email) return event;

  try {
    await client.send(
      new AdminGetUserCommand({
        UserPoolId: event.userPoolId,
        Username: email,
      }),
    );

    // Native user found — auto-confirm and auto-verify to enable linking
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name !== 'UserNotFoundException') {
      console.error('PreSignUp linking check failed:', err);
    }
  }

  return event;
};
