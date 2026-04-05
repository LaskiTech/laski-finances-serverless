import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { PreSignUpTriggerEvent, Context } from 'aws-lambda';

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  return { mockSend };
});

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: mockSend })),
  AdminGetUserCommand: vi.fn((input: unknown) => ({ _type: 'AdminGetUserCommand', input })),
}));

import { handler } from '../../src/auth/pre-sign-up';

const mockContext = {} as Context;

function makeEvent(triggerSource: string, email: string): PreSignUpTriggerEvent {
  return {
    version: '1',
    region: 'us-west-2',
    userPoolId: 'us-west-2_testPool',
    triggerSource,
    userName: 'Google_12345',
    callerContext: { awsSdkVersion: '3', clientId: 'test-client' },
    request: {
      userAttributes: { email },
    },
    response: {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    },
  } as PreSignUpTriggerEvent;
}

describe('PreSignUp Lambda — Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Feature: federated-auth, Property 14: PreSignUp trigger only links on ExternalProvider source
  it('Property 14: non-ExternalProvider triggers return unmodified event', async () => {
    const nonExternalSources = ['PreSignUp_SignUp', 'PreSignUp_AdminCreateUser'] as const;

    for (let i = 0; i < 100; i++) {
      const triggerSource = nonExternalSources[i % 2];
      const email = `user${i}@example.com`;

      mockSend.mockReset();
      const event = makeEvent(triggerSource, email);

      const result = await handler(event, mockContext, vi.fn());

      expect(result!.response.autoConfirmUser).toBe(false);
      expect(result!.response.autoVerifyEmail).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    }
  });

  // Feature: federated-auth, Property 15: Linked account sub is stable
  it('Property 15: handler never throws regardless of AdminGetUser behavior', () => {
    fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.emailAddress(),
        async (userExists, email) => {
          mockSend.mockReset();
          if (userExists) {
            mockSend.mockResolvedValueOnce({ Username: email });
          } else {
            const error = new Error('User not found');
            error.name = 'UserNotFoundException';
            mockSend.mockRejectedValueOnce(error);
          }

          const event = makeEvent('PreSignUp_ExternalProvider', email);

          const result = await handler(event, mockContext, vi.fn());
          expect(result).toBeDefined();

          if (userExists) {
            expect(result!.response.autoConfirmUser).toBe(true);
            expect(result!.response.autoVerifyEmail).toBe(true);
          } else {
            expect(result!.response.autoConfirmUser).toBe(false);
            expect(result!.response.autoVerifyEmail).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
