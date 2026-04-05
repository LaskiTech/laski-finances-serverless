import { render, act, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useContext } from 'react';
import { AuthProvider, AuthContext } from '../AuthProvider';
import type { AuthContextValue } from '../AuthProvider';

const {
  mockCognitoSignOut,
  mockCognitoGetCurrentUser,
} = vi.hoisted(() => ({
  mockCognitoSignOut: vi.fn(),
  mockCognitoGetCurrentUser: vi.fn(),
}));

vi.mock('../auth-service', () => ({
  cognitoSignIn: vi.fn(),
  cognitoSignUp: vi.fn(),
  cognitoConfirmSignUp: vi.fn(),
  cognitoResetPassword: vi.fn(),
  cognitoConfirmResetPassword: vi.fn(),
  cognitoSignOut: mockCognitoSignOut,
  cognitoResendSignUpCode: vi.fn(),
  cognitoGetCurrentUser: mockCognitoGetCurrentUser,
  cognitoSignInWithGoogle: vi.fn(),
}));

function TestConsumer({ onContext }: { onContext: (ctx: AuthContextValue) => void }): null {
  const ctx = useContext(AuthContext);
  if (ctx) onContext(ctx);
  return null;
}

async function renderProvider(): Promise<{ ctx: () => AuthContextValue; unmount: () => void }> {
  let capturedCtx: AuthContextValue | null = null;

  const { unmount } = render(
    <AuthProvider>
      <TestConsumer onContext={(c) => { capturedCtx = c; }} />
    </AuthProvider>,
  );

  await waitFor(() => {
    expect(capturedCtx!.isLoading).toBe(false);
  });

  return { ctx: () => capturedCtx!, unmount };
}

describe('AuthProvider property tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  // Feature: federated-auth, Property 12: Federated sign-out clears local session only
  it('Property 12: signOut clears user and isAuthenticated regardless of provider', async () => {
    const methods = ['native', 'federated'] as const;

    for (const method of methods) {
      for (let i = 0; i < 50; i++) {
        vi.clearAllMocks();
        cleanup();

        const username = method === 'federated' ? `Google_${i}` : `user_${i}`;
        mockCognitoGetCurrentUser.mockResolvedValueOnce({
          userId: `sub-${i}`,
          username,
          signInDetails: { loginId: `user${i}@example.com` },
        });
        mockCognitoSignOut.mockResolvedValueOnce(undefined);

        const { ctx, unmount } = await renderProvider();

        expect(ctx().isAuthenticated).toBe(true);
        expect(ctx().user).not.toBeNull();

        await act(async () => {
          await ctx().signOut();
        });

        expect(ctx().user).toBeNull();
        expect(ctx().isAuthenticated).toBe(false);

        unmount();
      }
    }
  }, 30000);

  // Feature: federated-auth, Property 13: AuthUser shape is identical regardless of provider
  it('Property 13: AuthUser has userId and email for both native and federated', async () => {
    const methods = ['native', 'federated'] as const;

    for (const method of methods) {
      for (let i = 0; i < 50; i++) {
        vi.clearAllMocks();
        cleanup();

        const email = `user${i}@example.com`;
        const userId = `uuid-${i}-${method}`;
        const username = method === 'federated' ? `Google_${userId}` : userId;
        mockCognitoGetCurrentUser.mockResolvedValueOnce({
          userId,
          username,
          signInDetails: { loginId: email },
        });

        const { ctx, unmount } = await renderProvider();

        const user = ctx().user;
        expect(user).not.toBeNull();
        expect(user!.userId).toBe(userId);
        expect(user!.email).toBe(email);
        expect(typeof user!.userId).toBe('string');
        expect(typeof user!.email).toBe('string');

        unmount();
      }
    }
  }, 30000);
});
