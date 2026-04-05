# Login E2E Playwright Tests

## Environment

- **URL:** `https://devfin.kioshitechmuta.link`
- **Auth methods:** Google Federation, Cognito email/password

## Pre-requisites

- Playwright MCP server must be available
- For Google sign-in tests: user must complete Google sign-in manually when prompted

## Shared State

- **Gmail base address:** `kioshitechmuta@gmail.com`
- **Dynamic alias pattern:** `kioshitechmuta+laski{N}@gmail.com` where `{N}` increments each run
- **Password for new users:** `TestPass1!2025` (meets Cognito policy: 8+ chars, upper, lower, digit, symbol)

To determine the next `{N}`, check the Transactions page or ask the user which number to use. If unknown, start at `1` and increment on `UsernameExistsException`.

---

## Test 1: Login via Google Federation

### Steps

1. Navigate to `https://devfin.kioshitechmuta.link`
2. Verify the Login page loaded (heading "Sign In" visible)
3. Click the **"Continue with Google"** button
4. **PAUSE** — Ask the user to complete Google sign-in manually. Wait for confirmation before continuing.
5. Take a snapshot to verify redirect to `/dashboard`

### Expected Result

- User is redirected to the Dashboard page (`/dashboard`)
- Page shows headings: "Dashboard", "Expenses by Category", "Balance Summary"
- Navigation bar shows "LASKI Finances" and a **"Sign out"** button

---

## Test 2: Logout after Google Login

> Requires: Test 1 completed (user is on Dashboard, authenticated)

### Steps

1. Verify current page is the Dashboard (heading "Dashboard" visible)
2. Click the **"Sign out"** button in the navigation bar
3. Take a snapshot to verify redirect to `/login`

### Expected Result

- User is redirected to the Login page (`/login`)
- Page shows heading "Sign In"
- "Continue with Google" button and email/password form are visible
- No auth session remains (navigating to `/dashboard` should redirect back to `/login`)

---

## Test 3: Sign Up a New User

### Steps

1. Navigate to `https://devfin.kioshitechmuta.link/login`
2. Click the **"Sign up"** link
3. Verify the Sign Up page loaded (heading "Sign Up" visible)
4. Fill the form:
   - **Email:** `kioshitechmuta+laski{N}@gmail.com` (use the next available N)
   - **Password:** `TestPass1!2025`
   - **Confirm Password:** `TestPass1!2025`
5. Click the **"Sign Up"** button
6. Verify redirect to the Confirm Sign Up page (heading "Verify Your Email" visible)
7. The page should display: "We sent a verification code to kioshitechmuta+laski{N}@gmail.com"
8. **PAUSE** — Ask the user to provide the 6-digit verification code from their email. Wait for the code.
9. Fill the **"Verification Code"** field with the code provided
10. Click the **"Verify"** button
11. Verify redirect to the Login page (`/login`)

### Expected Result

- After sign-up: redirected to `/confirm-signup` with the email in the URL
- After verification: redirected to `/login` with heading "Sign In"
- No error messages displayed at any step

---

## Test 4: Login with the Newly Created User

> Requires: Test 3 completed (new user verified)

### Steps

1. On the Login page, verify heading "Sign In" is visible
2. Fill the form:
   - **Email:** `kioshitechmuta+laski{N}@gmail.com` (same N from Test 3)
   - **Password:** `TestPass1!2025`
3. Click the **"Sign In"** button
4. Take a snapshot to verify redirect to `/dashboard`

### Expected Result

- User is redirected to the Dashboard page (`/dashboard`)
- Page shows headings: "Dashboard", "Expenses by Category", "Balance Summary"
- Navigation bar shows "LASKI Finances" and a **"Sign out"** button

---

## Test 5: Logout with the Newly Created User

> Requires: Test 4 completed (new user is on Dashboard, authenticated)

### Steps

1. Verify current page is the Dashboard (heading "Dashboard" visible)
2. Click the **"Sign out"** button in the navigation bar
3. Take a snapshot to verify redirect to `/login`

### Expected Result

- User is redirected to the Login page (`/login`)
- Page shows heading "Sign In"
- No auth session remains

---

## Test 6: Login with an Existing User (email/password)

> Uses the user created in Test 3

### Steps

1. Navigate to `https://devfin.kioshitechmuta.link/login`
2. Verify the Login page loaded (heading "Sign In" visible)
3. Fill the form:
   - **Email:** `kioshitechmuta+laski{N}@gmail.com` (same N from Test 3)
   - **Password:** `TestPass1!2025`
4. Click the **"Sign In"** button
5. Take a snapshot to verify redirect to `/dashboard`

### Expected Result

- User is redirected to the Dashboard page (`/dashboard`)
- Page shows headings: "Dashboard", "Expenses by Category", "Balance Summary"
- Navigation bar shows "LASKI Finances" and a **"Sign out"** button

---

## Test 7: Logout with the Existing User

> Requires: Test 6 completed (existing user is on Dashboard, authenticated)

### Steps

1. Verify current page is the Dashboard (heading "Dashboard" visible)
2. Click the **"Sign out"** button in the navigation bar
3. Take a snapshot to verify redirect to `/login`

### Expected Result

- User is redirected to the Login page (`/login`)
- Page shows heading "Sign In"
- No auth session remains

---

## Test 8: Protected Route Redirect (unauthenticated access)

### Steps

1. Ensure no user is logged in (run after a logout test, or navigate fresh)
2. Navigate directly to `https://devfin.kioshitechmuta.link/dashboard`
3. Take a snapshot

### Expected Result

- User is redirected to `/login?redirect=%2Fdashboard` (or similar redirect param)
- Login page is displayed, not the Dashboard
- After logging in, user should be redirected back to `/dashboard` (the originally requested route)

---

## Test 9: Sign Up with Invalid Data (validation)

### Steps

1. Navigate to `https://devfin.kioshitechmuta.link/signup`
2. Verify the Sign Up page loaded
3. Leave all fields empty and click **"Sign Up"**
4. Take a snapshot — verify validation errors appear
5. Fill with invalid data:
   - **Email:** `not-an-email`
   - **Password:** `short`
   - **Confirm Password:** `different`
6. Click **"Sign Up"**
7. Take a snapshot — verify validation errors appear

### Expected Result

- Step 4: validation errors shown for empty email and password fields
- Step 7: validation errors shown:
  - Email: invalid format error
  - Password: errors for missing uppercase, digit, symbol, and/or minimum length
  - Confirm Password: passwords do not match error
- No navigation away from the Sign Up page
- No network requests to Cognito (client-side validation blocks submission)

---

## Test 10: Login with Wrong Password

### Steps

1. Navigate to `https://devfin.kioshitechmuta.link/login`
2. Fill the form:
   - **Email:** `kioshitechmuta+laski{N}@gmail.com` (an existing user)
   - **Password:** `WrongPassword1!`
3. Click the **"Sign In"** button
4. Take a snapshot

### Expected Result

- User stays on the Login page (`/login`)
- An error message is displayed: "Incorrect email or password." (or similar)
- No redirect to Dashboard

---

## Execution Notes

- Tests should be run in order (1 through 10) as some depend on prior state
- Record the `{N}` value used for the new user alias so it can be incremented in future runs
- If a test fails, take a screenshot for debugging before continuing to the next test
- After all tests, report: total passed, total failed, and details of any failures
