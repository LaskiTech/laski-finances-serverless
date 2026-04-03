# Requirements Document: Federated Authentication (Google)

## Introduction

This document is an addendum to the Login feature requirements. It extends the existing email + password authentication with Google federated sign-in via Amazon Cognito Identity Federation. Users may sign in or register using their Google account without creating a separate password. All existing requirements in `login-requirements.md` remain in force; this document adds requirements specific to the federated flow only.

No new backend Lambda functions or API Gateway routes are required — Cognito handles the OAuth 2.0 exchange directly. The frontend uses Amplify JS v6's `signInWithRedirect` function, which is already part of the `aws-amplify/auth` package used by the rest of the login feature.

## Glossary

- **Federated_Provider**: An external identity provider (in this case, Google) whose tokens Cognito accepts and exchanges for its own ID, Access, and Refresh tokens.
- **Google_OAuth_App**: The OAuth 2.0 client registered in Google Cloud Console. Holds the `client_id` and `client_secret` configured in the Cognito User Pool's identity provider settings.
- **Hosted_UI**: The Cognito-managed OAuth 2.0 authorization endpoint that handles the redirect dance between the browser, Google, and Cognito. The app redirects to it; Cognito redirects back to the app's callback URL with an authorization code.
- **Callback_URL**: The frontend URL (`/auth/callback`) that Cognito redirects to after successful Google sign-in. Amplify JS handles the code exchange at this URL automatically.
- **Federated_User**: A Cognito user whose identity originates from Google. Distinguished from native users by the `identities` claim in the ID token. May or may not have a password set.
- **Account_Linking**: The process of associating a federated Google identity with an existing native Cognito account that shares the same email address, so the user ends up with a single account regardless of which sign-in method they use.
- **Auth_Module**: As defined in `login-requirements.md` — the frontend authentication module wrapping Amplify JS.

## Requirements

### Requirement 7: Google Sign-In

**User Story:** As a user, I want to sign in with my Google account, so that I can access LASKI Finances without creating and remembering a separate password.

#### Acceptance Criteria

1. THE Login_Page SHALL display a "Continue with Google" button alongside the existing email and password form.
2. WHEN the user clicks "Continue with Google", THE Auth_Module SHALL call `signInWithRedirect({ provider: 'Google' })` and redirect the browser to the Cognito Hosted_UI.
3. WHEN Google authentication succeeds and Cognito issues tokens, THE Auth_Module SHALL receive the authorization code at the Callback_URL, exchange it for tokens via Amplify JS, and redirect the user to the main application page or the originally requested protected route.
4. WHEN the user's Google account email does not match any existing Cognito account, THE Auth_Module SHALL create a new Federated_User account automatically — no sign-up form or email verification step is required.
5. WHEN the user's Google account email matches an existing native Cognito account (email + password), THE Auth_Module SHALL link the Google identity to that existing account so the user has one unified account accessible via both sign-in methods.
6. THE Auth_Module SHALL extract the `email` and `sub` claims from the Cognito ID token after federated sign-in and populate the `AuthUser` object identically to the native sign-in flow — no difference in the auth state shape.
7. IF the user cancels the Google sign-in flow (closes the popup or navigates back), THE Auth_Module SHALL return the user to the Login_Page without displaying an error.
8. IF the Cognito Hosted_UI returns an `error` query parameter at the Callback_URL, THE Auth_Module SHALL display a user-facing error message and redirect the user to the Login_Page.
9. THE "Continue with Google" button SHALL be disabled and show a loading indicator while a redirect is in progress, preventing duplicate clicks.

### Requirement 8: Federated Session Management

**User Story:** As a user who signed in with Google, I want my session to behave identically to a password-based session, so that I do not experience any difference in how the app manages my authentication state.

#### Acceptance Criteria

1. WHILE a valid Session exists from a Google sign-in, THE Auth_Module SHALL maintain the authenticated state across page reloads, identical to Requirement 4.1 of the base login spec.
2. WHEN the access token from a Google sign-in expires, THE Auth_Module SHALL automatically refresh the Session using the Cognito refresh token, identical to Requirement 4.2.
3. IF the refresh token expires, THE Auth_Module SHALL clear the Session and redirect the user to the Login_Page, identical to Requirement 4.3.
4. WHEN a federated user clicks the sign-out button, THE Auth_Module SHALL call `signOut()` which clears both the Amplify local session and the Cognito Hosted_UI session, then redirect the user to the Login_Page.
5. THE sign-out operation for a Federated_User SHALL NOT redirect to Google's sign-out page — only the Cognito session is terminated. The user's Google account remains signed in on the device.

### Requirement 9: Infrastructure — Cognito Identity Provider Configuration

**User Story:** As a developer, I want the Cognito User Pool configured to accept Google as a federated identity provider, so that the frontend can use `signInWithRedirect` without any custom backend code.

#### Acceptance Criteria

1. THE AuthStack SHALL configure a `UserPoolIdentityProviderGoogle` resource linked to the existing Cognito User Pool, using the Google OAuth 2.0 `client_id` and `client_secret` sourced from AWS Secrets Manager or CDK context — never hardcoded.
2. THE AuthStack SHALL configure the Cognito User Pool Client to allow the `implicit` and `authorization_code` OAuth flows and include `openid`, `email`, and `profile` scopes.
3. THE AuthStack SHALL register the following Callback URLs on the Cognito User Pool Domain: `https://devfin.kioshitechmuta.link/auth/callback` (dev) and `https://appfin.kioshitechmuta.link/auth/callback` (prod).
4. THE AuthStack SHALL register `https://devfin.kioshitechmuta.link/login` and `https://appfin.kioshitechmuta.link/login` as allowed Sign-Out URLs.
5. THE Cognito User Pool SHALL have attribute mapping configured to map the Google `email` claim to the Cognito `email` attribute and `sub` to `username`.
6. THE Google_OAuth_App registered in Google Cloud Console SHALL have the Cognito Hosted_UI domain (e.g. `https://auth.devfin.kioshitechmuta.link`) added as an authorised redirect URI — this is a manual step outside CDK and SHALL be documented in the deployment runbook.
7. THE `amplify-config.ts` frontend configuration SHALL be extended with the Cognito domain and OAuth settings required for `signInWithRedirect` to function:
   ```typescript
   loginWith: {
     oauth: {
       domain: import.meta.env.VITE_COGNITO_DOMAIN,
       scopes: ['openid', 'email', 'profile'],
       redirectSignIn: [import.meta.env.VITE_OAUTH_REDIRECT_SIGN_IN],
       redirectSignOut: [import.meta.env.VITE_OAUTH_REDIRECT_SIGN_OUT],
       responseType: 'code',
     },
   }
   ```

### Requirement 10: Account Linking

**User Story:** As a user who previously created an account with email and password, I want signing in with Google to recognise my existing account, so that I do not end up with two separate accounts.

#### Acceptance Criteria

1. WHEN a Google sign-in attempt arrives with an email that matches an existing native Cognito account, THE Cognito User Pool SHALL automatically link the Google identity to that account using the `PreSignUp` Lambda trigger with the `autoConfirmUser` and `autoVerifyEmail` flags — no user action required.
2. AFTER Account_Linking, WHEN the user signs in with either Google or their original email + password, they SHALL access the same Cognito user record and therefore the same DynamoDB data partition (`USER#<same-sub>`).
3. THE linked account's `sub` claim SHALL remain the same as the original native account's `sub` — the partition key in DynamoDB is never changed by linking.
4. IF a Google account's email does not match any existing account, Account_Linking SHALL NOT be attempted — a new Federated_User is created instead (Requirement 7.4).
