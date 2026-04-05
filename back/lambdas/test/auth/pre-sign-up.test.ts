import { describe, it, expect, vi, beforeEach } from 'vitest';
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

function makeEvent(overrides: Partial<PreSignUpTriggerEvent> = {}): PreSignUpTriggerEvent {
  return {
    version: '1',
    region: 'us-west-2',
    userPoolId: 'us-west-2_testPool',
    triggerSource: 'PreSignUp_ExternalProvider',
    userName: 'Google_12345',
    callerContext: { awsSdkVersion: '3', clientId: 'test-client' },
    request: {
      userAttributes: { email: 'test@example.com' },
    },
    response: {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    },
    ...overrides,
  } as PreSignUpTriggerEvent;
}

describe('PreSignUp Lambda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns event unchanged when triggerSource is PreSignUp_SignUp', async () => {
    const event = makeEvent({ triggerSource: 'PreSignUp_SignUp' });
    const result = await handler(event, mockContext, vi.fn());

    expect(result).toEqual(event);
    expect(result!.response.autoConfirmUser).toBe(false);
    expect(result!.response.autoVerifyEmail).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns event unchanged when triggerSource is PreSignUp_AdminCreateUser', async () => {
    const event = makeEvent({ triggerSource: 'PreSignUp_AdminCreateUser' });
    const result = await handler(event, mockContext, vi.fn());

    expect(result).toEqual(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sets autoConfirmUser and autoVerifyEmail when existing user found', async () => {
    mockSend.mockResolvedValueOnce({
      Username: 'test@example.com',
      UserAttributes: [{ Name: 'email', Value: 'test@example.com' }],
    });

    const event = makeEvent();
    const result = await handler(event, mockContext, vi.fn());

    expect(result!.response.autoConfirmUser).toBe(true);
    expect(result!.response.autoVerifyEmail).toBe(true);
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('does not set auto-confirm flags when AdminGetUser throws UserNotFoundException', async () => {
    const error = new Error('User not found');
    error.name = 'UserNotFoundException';
    mockSend.mockRejectedValueOnce(error);

    const event = makeEvent();
    const result = await handler(event, mockContext, vi.fn());

    expect(result!.response.autoConfirmUser).toBe(false);
    expect(result!.response.autoVerifyEmail).toBe(false);
  });

  it('does not throw when AdminGetUser throws unexpected error', async () => {
    const error = new Error('Internal error');
    error.name = 'InternalErrorException';
    mockSend.mockRejectedValueOnce(error);

    const event = makeEvent();
    const result = await handler(event, mockContext, vi.fn());

    expect(result!.response.autoConfirmUser).toBe(false);
    expect(result!.response.autoVerifyEmail).toBe(false);
  });

  it('returns event unchanged when email attribute is absent', async () => {
    const event = makeEvent();
    event.request.userAttributes = {};
    const result = await handler(event, mockContext, vi.fn());

    expect(result).toEqual(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('calls AdminGetUser with correct UserPoolId and Username', async () => {
    mockSend.mockResolvedValueOnce({ Username: 'test@example.com' });
    const event = makeEvent();
    await handler(event, mockContext, vi.fn());

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { UserPoolId: 'us-west-2_testPool', Username: 'test@example.com' },
      }),
    );
  });
});
