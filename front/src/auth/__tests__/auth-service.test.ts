import { describe, it, expect, vi } from 'vitest';

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
  resendSignUpCode: vi.fn(),
  getCurrentUser: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

import { signInWithRedirect } from 'aws-amplify/auth';
import { cognitoSignInWithGoogle } from '../auth-service';

describe('cognitoSignInWithGoogle', () => {
  it('calls signInWithRedirect with provider Google', async () => {
    await cognitoSignInWithGoogle();

    expect(signInWithRedirect).toHaveBeenCalledWith({ provider: 'Google' });
    expect(signInWithRedirect).toHaveBeenCalledOnce();
  });
});
