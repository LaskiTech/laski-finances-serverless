# Implementation Plan: Dashboard Hamburger Menu

## Overview

Implement a persistent application layout with hamburger-menu navigation drawer, a new Dashboard page with expense pie chart and net balance display, route restructuring, and Cognito token validity configuration. The implementation uses the existing Chakra UI component library, adds Recharts for the pie chart, and leverages the existing `listTransactions` API with no backend changes.

## Tasks

- [x] 1. Create dashboard utility functions
  - [x] 1.1 Create `front/src/utils/dashboard.ts` with `CategoryTotal` and `BalanceSummary` interfaces, `aggregateExpensesByCategory`, `computeNetBalance`, `getCurrentMonth`, and `getBalanceColor` functions
    - `aggregateExpensesByCategory` takes an array of EXP `TransactionItem` and returns `CategoryTotal[]` sorted by total descending
    - `computeNetBalance` takes an array of all transactions and returns `BalanceSummary` with `totalIncome`, `totalExpenses`, `netBalance`
    - `getCurrentMonth` returns current month as `YYYY-MM` string
    - `getBalanceColor` returns `"green"` for positive, `"red"` for negative, neutral otherwise
    - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 1.2 Write property test: Expense aggregation correctness
    - **Property 1: Expense aggregation correctness**
    - Generate arrays of `TransactionItem` with random categories and positive amounts, type fixed to `'EXP'`
    - Assert: one entry per unique category, each entry total equals sum of amounts for that category, sum of all totals equals sum of all input amounts
    - **Validates: Requirements 2.4, 2.5**

  - [ ]* 1.3 Write property test: Net balance computation correctness
    - **Property 2: Net balance computation correctness**
    - Generate arrays of `TransactionItem` with random types (`'INC'` or `'EXP'`) and random positive amounts
    - Assert: `totalIncome` equals sum of INC amounts, `totalExpenses` equals sum of EXP amounts, `netBalance` equals `totalIncome - totalExpenses`
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 1.4 Write property test: Balance color coding
    - **Property 3: Balance color coding**
    - Generate arbitrary numbers (positive, negative, zero)
    - Assert: positive → green, negative → red, zero → neutral
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 1.5 Write unit tests for dashboard utility functions
    - Test `aggregateExpensesByCategory` with empty array, single transaction, multiple transactions in same category
    - Test `computeNetBalance` with all INC, all EXP, mixed, empty array
    - Test `getCurrentMonth` returns correct `YYYY-MM` format
    - Place tests in `front/src/utils/__tests__/dashboard.test.ts`
    - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [x] 2. Checkpoint - Verify utility functions
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create AppLayout component with hamburger menu
  - [x] 3.1 Create `front/src/components/AppLayout.tsx`
    - Render a fixed header bar with: hamburger `IconButton` (left), "LASKI Finances" title (center), sign-out `Button` (right)
    - Use Chakra UI `Drawer` (via `useDisclosure`) opening from the left with navigation links: "Dashboard" (`/dashboard`) and "Transactions" (`/transactions`)
    - Highlight active link based on `useLocation()` current path
    - Close drawer on link click and navigate using `useNavigate()`
    - Sign-out button calls `useAuth().signOut()` and navigates to `/login`
    - Render `<Outlet />` below the header for nested route content
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [ ]* 3.2 Write unit tests for AppLayout
    - Test header renders title, hamburger button, and sign-out button
    - Test drawer opens on hamburger click and closes on outside click or close button
    - Test navigation links render and navigate correctly
    - Test active link highlighting
    - Test sign-out triggers `signOut()` and redirects to `/login`
    - Place tests in `front/src/components/__tests__/AppLayout.test.tsx`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

- [x] 4. Create DashboardPage component
  - [x] 4.1 Install `recharts` dependency (exact version) in `front/package.json`
    - _Requirements: 2.4_

  - [x] 4.2 Create `front/src/pages/DashboardPage.tsx`
    - Render month selector (`<Input type="month" />`) defaulting to `getCurrentMonth()`
    - On month change, fetch EXP transactions (`listTransactions(month, 'EXP')`) and all transactions (`listTransactions(month)`) concurrently
    - Use `aggregateExpensesByCategory` for pie chart data and `computeNetBalance` for balance summary
    - Render Recharts `<PieChart>` / `<Pie>` with category name and amount/percentage labels
    - Display "No expense data available" message when no EXP transactions exist
    - Render net balance with color coding via `getBalanceColor`, plus individual income and expense totals formatted with `formatCurrency`
    - Handle loading state with `<Spinner>`, error state with Chakra UI `Alert`
    - On 401 API error, sign out and redirect to `/login`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.5_

  - [ ]* 4.3 Write unit tests for DashboardPage
    - Test loading state renders spinner
    - Test error state renders alert message
    - Test empty data shows "No expense data available"
    - Test month selector defaults to current month
    - Test re-fetch on month change
    - Place tests in `front/src/pages/__tests__/DashboardPage.test.tsx`
    - _Requirements: 2.2, 2.7, 2.8, 2.9, 3.6_

- [x] 5. Checkpoint - Verify components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Update routing and remove HomePage
  - [x] 6.1 Update `front/src/router/routes.tsx`
    - Import `AppLayout` and `DashboardPage`
    - Replace individual `<ProtectedRoute>` wrapping with a parent `<Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>` that nests all protected routes
    - Add `/dashboard` route rendering `<DashboardPage />`
    - Change `/` redirect from `/transactions` to `/dashboard`
    - Remove `HomePage` import (no longer used)
    - _Requirements: 4.1, 4.2, 2.1_

  - [x] 6.2 Delete `front/src/pages/HomePage.tsx`
    - Remove the file since Dashboard replaces it as the default landing page
    - _Requirements: 4.2_

- [x] 7. Update Cognito token validity in AuthStack
  - [x] 7.1 Update `infra/lib/auth-stack.ts` User Pool Client configuration
    - Add `accessTokenValidity: cdk.Duration.days(1)` and `idTokenValidity: cdk.Duration.days(1)` to the `UserPoolClient` construct props
    - _Requirements: 5.1, 5.2_

  - [ ]* 7.2 Extend CDK assertion test for token validity
    - Add assertions in `infra/test/stacks.test.ts` verifying the User Pool Client has `AccessTokenValidity` and `IdTokenValidity` set to 1 day
    - _Requirements: 5.1, 5.2_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` (already in devDependencies) with Vitest
- No backend changes required — the existing `listTransactions` API supports `month` and `type` filters
- `recharts` must be installed with an exact version per project coding standards
