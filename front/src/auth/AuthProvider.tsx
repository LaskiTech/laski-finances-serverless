import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  cognitoSignIn,
  cognitoSignUp,
  cognitoConfirmSignUp,
  cognitoResetPassword,
  cognitoConfirmResetPassword,
  cognitoSignOut,
  cognitoResendSignUpCode,
  cognitoGetCurrentUser,
  cognitoSignInWithGoogle,
} from './auth-service';

export interface AuthUser {
  userId: string;
  email: string;
  identityProvider?: 'Google' | 'Cognito';
}

export interface SignInResult {
  success: boolean;
  nextStep?: 'CONFIRM_SIGN_UP' | 'DONE';
}

export interface SignUpResult {
  success: boolean;
  nextStep: 'CONFIRM_SIGN_UP' | 'DONE';
}

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendSignUpCode: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const ERROR_MAP: Record<string, string> = {
  UsernameExistsException: 'An account with this email already exists.',
  NotAuthorizedException: 'Incorrect email or password.',
  UserNotConfirmedException: 'Please verify your email address.',
  CodeMismatchException: 'Invalid verification code. Please try again.',
  ExpiredCodeException: 'Verification code has expired. Request a new one.',
  LimitExceededException: 'Too many attempts. Please try again later.',
  NetworkError: 'Network error. Please check your connection.',
  UserLambdaValidationException: 'Sign-in could not be completed. Please try again.',
};

function mapCognitoError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    if (name === 'InvalidPasswordException') {
      return error.message || 'Password does not meet the required policy.';
    }
    if (name in ERROR_MAP) {
      return ERROR_MAP[name];
    }
    if (name === 'NetworkError' || error.message?.includes('Network')) {
      return ERROR_MAP.NetworkError;
    }
  }
  return 'An unexpected error occurred. Please try again.';
}

function detectIdentityProvider(username: string): 'Google' | 'Cognito' {
  if (username.startsWith('google_') || username.startsWith('Google_')) {
    return 'Google';
  }
  return 'Cognito';
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = user !== null;

  useEffect(() => {
    let cancelled = false;
    async function restoreSession(): Promise<void> {
      try {
        const currentUser = await cognitoGetCurrentUser();
        if (!cancelled) {
          setUser({
            userId: currentUser.userId,
            email: currentUser.signInDetails?.loginId ?? '',
            identityProvider: detectIdentityProvider(currentUser.username),
          });
        }
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    try {
      const result = await cognitoSignIn(email, password);
      const step = result.nextStep?.signInStep;
      if (step === 'CONFIRM_SIGN_UP') {
        return { success: true, nextStep: 'CONFIRM_SIGN_UP' };
      }
      const currentUser = await cognitoGetCurrentUser();
      setUser({
        userId: currentUser.userId,
        email: currentUser.signInDetails?.loginId ?? email,
        identityProvider: 'Cognito',
      });
      return { success: true, nextStep: 'DONE' };
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    try {
      const result = await cognitoSignUp(email, password);
      const step = result.nextStep?.signUpStep;
      if (step === 'CONFIRM_SIGN_UP') {
        return { success: true, nextStep: 'CONFIRM_SIGN_UP' };
      }
      return { success: true, nextStep: 'DONE' };
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  }, []);

  const confirmSignUp = useCallback(async (email: string, code: string): Promise<void> => {
    try {
      await cognitoConfirmSignUp(email, code);
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  }, []);

  const resetPassword = useCallback(async (email: string): Promise<void> => {
    try {
      await cognitoResetPassword(email);
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  }, []);

  const confirmResetPassword = useCallback(
    async (email: string, code: string, newPassword: string): Promise<void> => {
      try {
        await cognitoConfirmResetPassword(email, code, newPassword);
      } catch (error) {
        throw new Error(mapCognitoError(error));
      }
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await cognitoSignOut();
      setUser(null);
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  }, []);

  const resendSignUpCode = useCallback(async (email: string): Promise<void> => {
    try {
      await cognitoResendSignUpCode(email);
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    try {
      await cognitoSignInWithGoogle();
    } catch (error) {
      throw new Error(mapCognitoError(error));
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      signIn,
      signUp,
      confirmSignUp,
      resetPassword,
      confirmResetPassword,
      signOut,
      resendSignUpCode,
      signInWithGoogle,
    }),
    [user, isAuthenticated, isLoading, signIn, signUp, confirmSignUp, resetPassword, confirmResetPassword, signOut, resendSignUpCode, signInWithGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
