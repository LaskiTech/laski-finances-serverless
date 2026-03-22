# Implementation Plan: Login Feature

## Overview

Scaffold the `front/` workspace (React + TypeScript + Vite + Chakra UI) and implement the full authentication flow using Amplify JS v6 against the existing Cognito User Pool. Tasks are ordered so each step builds on the previous one, starting with project setup, then core auth logic, then UI pages, then routing and wiring.

## Tasks

- [x] 1. Scaffold the `front/` workspace
  - [x] 1.1 Initialize the Vite + React + TypeScript project
    - Create `front/` directory with `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, and `src/main.tsx`
    - Use exact dependency versions (no `^` or `~`): react, react-dom, @chakra-ui/react, aws-amplify, react-router-dom
    - Add devDependencies: typescript, @types/react, @types/react-dom, vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, fast-check, jsdom, @vitejs/plugin-react
    - Configure `tsconfig.json` with strict mode, ES2022 target, JSX support
    - Configure `vite.config.ts` with React plugin and Vitest setup
    - Create `.env.example` with `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID`
    - _Requirements: All (project foundation)_

  - [x] 1.2 Create the App shell with Chakra UI and React Router
    - Create `src/App.tsx` wrapping the app in `ChakraProvider` and `BrowserRouter`
    - Create a minimal `src/pages/HomePage.tsx` placeholder (protected page)
    - Verify the app renders without errors
    - _Requirements: All (app shell)_

- [x] 2. Implement validation functions
  - [x] 2.1 Create `src/auth/validation.ts` with pure validation functions
    - Implement `validateEmail`, `validatePassword`, `validatePasswordMatch`, `validateSignInForm`, `validateSignUpForm`
    - Password policy: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 symbol (matches Cognito config)
    - Each function returns `{ valid: boolean, errors: string[] }`
    - _Requirements: 1.6, 1.7, 6.1, 6.2, 6.3_

  - [ ]* 2.2 Write property test: Password validation detects all policy violations
    - **Property 1: Password validation detects all policy violations**
    - **Validates: Requirements 1.6, 3.6**

  - [ ]* 2.3 Write property test: Password mismatch detection
    - **Property 2: Password mismatch detection**
    - **Validates: Requirements 1.7**

  - [ ]* 2.4 Write property test: Email validation rejects invalid formats
    - **Property 3: Email validation rejects invalid formats**
    - **Validates: Requirements 6.3**

  - [ ]* 2.5 Write property test: Sign-in form validation composes field validations
    - **Property 4: Sign-in form validation composes field validations**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 3. Implement auth service and AuthProvider
  - [x] 3.1 Create `src/auth/amplify-config.ts`
    - Configure Amplify with Cognito User Pool ID and Client ID from `import.meta.env`
    - _Requirements: 2.2 (Cognito integration foundation)_

  - [x] 3.2 Create `src/auth/auth-service.ts` with Amplify Auth wrappers
    - Implement thin wrappers: `cognitoSignIn`, `cognitoSignUp`, `cognitoConfirmSignUp`, `cognitoResetPassword`, `cognitoConfirmResetPassword`, `cognitoSignOut`, `cognitoFetchSession`, `cognitoResendSignUpCode`, `cognitoGetCurrentUser`
    - Each function delegates to the corresponding `aws-amplify/auth` function
    - _Requirements: 1.2, 2.2, 3.2, 3.3, 4.4_

  - [x] 3.3 Create `src/auth/AuthProvider.tsx` and `src/auth/useAuth.ts`
    - Implement `AuthProvider` with React Context managing `user`, `isAuthenticated`, `isLoading`
    - On mount, call `cognitoGetCurrentUser` and `cognitoFetchSession` to restore session
    - Expose auth actions: `signIn`, `signUp`, `confirmSignUp`, `resetPassword`, `confirmResetPassword`, `signOut`, `resendSignUpCode`
    - Map Cognito exceptions to user-friendly error messages (per error handling table in design)
    - Implement `useAuth` hook to consume the context
    - _Requirements: 2.3, 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.4 Write property test: Sign-out clears authentication state
    - **Property 7: Sign-out clears authentication state**
    - **Validates: Requirements 4.4**

  - [ ]* 3.5 Write property test: Session restoration on reload
    - **Property 8: Session restoration on reload**
    - **Validates: Requirements 4.1**

- [x] 4. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement routing and ProtectedRoute
  - [x] 5.1 Create `src/router/ProtectedRoute.tsx`
    - If `isLoading`, render a spinner
    - If `isAuthenticated` is false, redirect to `/login?redirect={currentPath}`
    - If `isAuthenticated` is true, render children
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 Create `src/router/routes.tsx` with route definitions
    - Public routes: `/login`, `/signup`, `/confirm-signup`, `/forgot-password`, `/reset-password`
    - Protected routes: `/` (HomePage) wrapped in `ProtectedRoute`
    - _Requirements: 5.1, 5.2_

  - [ ]* 5.3 Write property test: Protected route access matches authentication status
    - **Property 5: Protected route access matches authentication status**
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 5.4 Write property test: Redirect path preservation round-trip
    - **Property 6: Redirect path preservation round-trip**
    - **Validates: Requirements 5.3**

- [x] 6. Implement authentication pages
  - [x] 6.1 Create `src/pages/LoginPage.tsx`
    - Sign-in form with email and password fields using Chakra UI form components
    - Client-side validation using `validateSignInForm` with inline error messages
    - Disable submit button while request is in progress
    - Handle `NotAuthorizedException` and `UserNotConfirmedException` errors
    - Links to SignUp and Password Recovery pages
    - On success, redirect to `redirect` query param or `/`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 5.3, 6.1, 6.2, 6.3, 6.4_

  - [x] 6.2 Create `src/pages/SignUpPage.tsx`
    - Registration form with email, password, and confirm password fields
    - Client-side validation using `validateSignUpForm` with inline error messages
    - Handle `UsernameExistsException` error
    - On success, redirect to confirm-signup page
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7_

  - [x] 6.3 Create `src/pages/ConfirmSignUpPage.tsx`
    - Verification code input field
    - Handle `CodeMismatchException` and `ExpiredCodeException` errors
    - Resend code option
    - On success, redirect to login page
    - _Requirements: 1.3, 1.4, 1.8_

  - [x] 6.4 Create `src/pages/PasswordRecoveryPage.tsx`
    - Email input form to request reset code
    - On submit, call `resetPassword` and redirect to reset-password page
    - _Requirements: 3.1, 3.2_

  - [x] 6.5 Create `src/pages/ResetPasswordPage.tsx`
    - Form with verification code, new password, and confirm password fields
    - Client-side validation for password policy and match
    - Handle `CodeMismatchException` and `ExpiredCodeException` errors
    - On success, redirect to login page with success message
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [ ]* 6.6 Write unit tests for LoginPage
    - Test form renders with email and password fields
    - Test validation errors display on empty submit
    - Test submit button disabled during loading
    - Test navigation links to signup and forgot-password
    - _Requirements: 2.1, 2.6, 2.7, 6.1, 6.2, 6.4_

- [x] 7. Wire everything together in App.tsx
  - [x] 7.1 Integrate AuthProvider, Router, and routes in `src/App.tsx`
    - Wrap app in `AuthProvider` → `ChakraProvider` → `RouterProvider`/`BrowserRouter`
    - Call `Amplify.configure()` in `src/main.tsx` before rendering
    - Add sign-out button to the HomePage (or a shared layout)
    - _Requirements: 4.4, 5.1, 5.2_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with Vitest (minimum 100 iterations per property)
- All auth is client-side via Amplify JS v6 — no backend changes needed
- The `front/` workspace uses exact dependency versions per coding standards
