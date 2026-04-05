import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

const { mockSignInWithRedirect } = vi.hoisted(() => ({
  mockSignInWithRedirect: vi.fn(),
}));

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
  signInWithRedirect: mockSignInWithRedirect,
}));

import { cognitoSignInWithGoogle } from '../auth-service';

describe('auth-service property tests', () => {
  // Feature: federated-auth, Property 9: Google sign-in initiates a redirect
  it('Property 9: signInWithRedirect is called exactly once per cognitoSignInWithGoogle call', () => {
    fc.assert(
      fc.asyncProperty(fc.boolean(), async () => {
        mockSignInWithRedirect.mockClear();
        mockSignInWithRedirect.mockResolvedValueOnce(undefined);

        await cognitoSignInWithGoogle();

        expect(mockSignInWithRedirect).toHaveBeenCalledOnce();
        expect(mockSignInWithRedirect).toHaveBeenCalledWith({ provider: 'Google' });
      }),
      { numRuns: 100 },
    );
  });
});
