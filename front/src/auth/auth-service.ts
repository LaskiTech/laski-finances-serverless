import {
  signIn,
  signUp,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  signOut,
  fetchAuthSession,
  resendSignUpCode,
  getCurrentUser,
  type SignInOutput,
  type SignUpOutput,
  type ConfirmSignUpOutput,
  type ResetPasswordOutput,
  type AuthSession,
  type AuthUser,
} from 'aws-amplify/auth';

/** Thin wrappers around Amplify Auth functions for testability */

export async function cognitoSignIn(email: string, password: string): Promise<SignInOutput> {
  return signIn({ username: email, password });
}

export async function cognitoSignUp(email: string, password: string): Promise<SignUpOutput> {
  return signUp({ username: email, password });
}

export async function cognitoConfirmSignUp(email: string, code: string): Promise<ConfirmSignUpOutput> {
  return confirmSignUp({ username: email, confirmationCode: code });
}

export async function cognitoResetPassword(email: string): Promise<ResetPasswordOutput> {
  return resetPassword({ username: email });
}

export async function cognitoConfirmResetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
}

export async function cognitoSignOut(): Promise<void> {
  await signOut();
}

export async function cognitoFetchSession(): Promise<AuthSession> {
  return fetchAuthSession();
}

export async function cognitoResendSignUpCode(email: string): Promise<void> {
  await resendSignUpCode({ username: email });
}

export async function cognitoGetCurrentUser(): Promise<AuthUser> {
  return getCurrentUser();
}
