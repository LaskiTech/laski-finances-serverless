# Requirements Document

## Introduction

The Login feature provides authentication for LASKI Finances, a personal finance management app. Users authenticate via email and password using AWS Cognito (SRP flow). The frontend is a React + TypeScript SPA using Amplify JS libraries for Cognito integration, styled with Chakra UI. This feature covers sign-up, sign-in, password recovery, session management, and protected route access.

## Glossary

- **Auth_Module**: The frontend authentication module that integrates with AWS Cognito via Amplify JS libraries to handle sign-up, sign-in, sign-out, password recovery, and session management.
- **Login_Page**: The page that presents the sign-in form to unauthenticated users.
- **SignUp_Page**: The page that presents the registration form for new users.
- **Password_Recovery_Page**: The page that allows users to reset a forgotten password via email verification code.
- **Session**: An authenticated user context containing Cognito tokens (ID token, access token, refresh token) managed by Amplify JS.
- **Protected_Route**: A frontend route that requires a valid Session to access; unauthenticated users are redirected to the Login_Page.
- **Cognito_User_Pool**: The AWS Cognito User Pool configured in the AuthStack that stores user accounts and handles authentication flows.
- **Email_Verification_Code**: A one-time code sent by Cognito to the user's email address for account confirmation or password reset.

## Requirements

### Requirement 1: User Sign-Up

**User Story:** As a new user, I want to create an account with my email and password, so that I can access LASKI Finances.

#### Acceptance Criteria

1. THE SignUp_Page SHALL display a registration form with email, password, and password confirmation fields.
2. WHEN a user submits the registration form with a valid email and matching passwords, THE Auth_Module SHALL create a new account in the Cognito_User_Pool.
3. WHEN account creation succeeds, THE Auth_Module SHALL send an Email_Verification_Code to the provided email address.
4. WHEN a user submits a valid Email_Verification_Code, THE Auth_Module SHALL confirm the account and redirect the user to the Login_Page.
5. IF the submitted email is already registered, THEN THE Auth_Module SHALL display an error message indicating the email is already in use.
6. IF the password does not meet the policy (minimum 8 characters, at least one uppercase letter, one lowercase letter, one digit, and one symbol), THEN THE Auth_Module SHALL display the specific password policy violations.
7. IF the passwords do not match, THEN THE SignUp_Page SHALL display an error message indicating the passwords do not match.
8. IF the Email_Verification_Code is invalid or expired, THEN THE Auth_Module SHALL display an error message and allow the user to request a new code.

### Requirement 2: User Sign-In

**User Story:** As a registered user, I want to sign in with my email and password, so that I can access my financial data.

#### Acceptance Criteria

1. THE Login_Page SHALL display a sign-in form with email and password fields.
2. WHEN a user submits valid credentials, THE Auth_Module SHALL authenticate the user using the SRP flow against the Cognito_User_Pool.
3. WHEN authentication succeeds, THE Auth_Module SHALL store the Session tokens and redirect the user to the main application page.
4. IF the credentials are invalid, THEN THE Auth_Module SHALL display an error message indicating the email or password is incorrect.
5. IF the user account is not confirmed, THEN THE Auth_Module SHALL display a message prompting the user to verify the email address and provide an option to resend the Email_Verification_Code.
6. THE Login_Page SHALL provide a link to the SignUp_Page for new users.
7. THE Login_Page SHALL provide a link to the Password_Recovery_Page for users who forgot the password.

### Requirement 3: Password Recovery

**User Story:** As a user who forgot my password, I want to reset it via email, so that I can regain access to my account.

#### Acceptance Criteria

1. THE Password_Recovery_Page SHALL display a form requesting the user's email address.
2. WHEN a user submits a registered email address, THE Auth_Module SHALL send an Email_Verification_Code to that address.
3. WHEN the user provides a valid Email_Verification_Code and a new password, THE Auth_Module SHALL reset the password in the Cognito_User_Pool.
4. WHEN the password reset succeeds, THE Auth_Module SHALL redirect the user to the Login_Page with a success message.
5. IF the Email_Verification_Code is invalid or expired, THEN THE Auth_Module SHALL display an error message and allow the user to request a new code.
6. IF the new password does not meet the password policy, THEN THE Auth_Module SHALL display the specific password policy violations.

### Requirement 4: Session Management

**User Story:** As an authenticated user, I want my session to persist across page reloads, so that I do not need to sign in repeatedly.

#### Acceptance Criteria

1. WHILE a valid Session exists, THE Auth_Module SHALL maintain the authenticated state across page reloads.
2. WHEN the access token expires, THE Auth_Module SHALL automatically refresh the Session using the refresh token.
3. IF the refresh token is expired or invalid, THEN THE Auth_Module SHALL clear the Session and redirect the user to the Login_Page.
4. WHEN a user clicks the sign-out button, THE Auth_Module SHALL clear the Session tokens and redirect the user to the Login_Page.

### Requirement 5: Protected Routes

**User Story:** As a product owner, I want unauthenticated users to be blocked from accessing application pages, so that financial data remains secure.

#### Acceptance Criteria

1. WHEN an unauthenticated user navigates to a Protected_Route, THE Auth_Module SHALL redirect the user to the Login_Page.
2. WHILE a valid Session exists, THE Auth_Module SHALL allow the user to access Protected_Route pages.
3. WHEN the user is redirected to the Login_Page from a Protected_Route, THE Auth_Module SHALL redirect the user back to the originally requested page after successful sign-in.

### Requirement 6: Sign-In Form Validation

**User Story:** As a user, I want immediate feedback on form input errors, so that I can correct mistakes before submitting.

#### Acceptance Criteria

1. WHEN a user attempts to submit the sign-in form with an empty email field, THE Login_Page SHALL display a validation error on the email field.
2. WHEN a user attempts to submit the sign-in form with an empty password field, THE Login_Page SHALL display a validation error on the password field.
3. WHEN a user enters an invalid email format, THE Login_Page SHALL display a validation error indicating the email format is invalid.
4. THE Login_Page SHALL disable the submit button while a sign-in request is in progress to prevent duplicate submissions.
