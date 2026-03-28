# Requirements Document

## Introduction

This feature introduces a hamburger menu as the primary navigation component for the LASKI Finances front-end, along with a new Dashboard page. The hamburger menu provides access to two sections: a Dashboard page displaying a pie chart of expenses grouped by category and the net balance (income minus expenses), and the existing Transactions list page. The menu replaces the current lack of structured navigation with a consistent, accessible navigation pattern.

## Glossary

- **Hamburger_Menu**: A collapsible navigation component triggered by a three-line icon button, typically positioned in the top-left corner of the application header. The menu slides open as a drawer overlay to reveal navigation links.
- **Dashboard_Page**: A protected page that displays a summary of the user's financial data for a selected month, including a pie chart of expenses by category and the net balance.
- **Pie_Chart**: A circular chart that divides expense data into slices proportional to each category's share of total expenses.
- **Net_Balance**: The computed difference between the sum of all INC (income) transactions and the sum of all EXP (expense) transactions for a given period.
- **Category**: A classification label assigned to each transaction (e.g., Food, Transport, Health, Salary).
- **Transaction**: A financial ledger entry of type INC (income) or EXP (expense) with fields: description, amount, date, type, source, and category.
- **App_Layout**: A shared layout wrapper component that renders the application header with the Hamburger_Menu across all protected pages.
- **Cognito_User_Pool**: The AWS Cognito User Pool that manages user authentication, session tokens, and token expiration policies for the application.
- **Session**: The authenticated state maintained by Cognito access and ID tokens issued after a successful sign-in. A session remains valid until its tokens expire.

## Requirements

### Requirement 1: Application Layout with Hamburger Menu

**User Story:** As a user, I want a consistent navigation menu across all protected pages, so that I can easily switch between the Dashboard and Transactions pages.

#### Acceptance Criteria

1. THE App_Layout SHALL render a header bar at the top of every protected page.
2. THE App_Layout SHALL display a hamburger icon button on the left side of the header bar.
3. WHEN the user activates the hamburger icon button, THE Hamburger_Menu SHALL open as a drawer overlay from the left side of the screen.
4. THE Hamburger_Menu SHALL display two navigation links: "Dashboard" and "Transactions".
5. WHEN the user selects a navigation link, THE Hamburger_Menu SHALL close and THE App_Layout SHALL navigate to the corresponding page.
6. WHEN the user activates the close button or clicks outside the drawer, THE Hamburger_Menu SHALL close without navigating.
7. THE Hamburger_Menu SHALL indicate the currently active page by visually highlighting the corresponding navigation link.
8. THE App_Layout SHALL display the application title "LASKI Finances" in the header bar.
9. THE App_Layout SHALL display a sign-out button on the right side of the header bar.
10. WHEN the user activates the sign-out button, THE App_Layout SHALL sign the user out and redirect to the login page.

### Requirement 2: Dashboard Page with Expense Pie Chart

**User Story:** As a user, I want to see a pie chart of my expenses grouped by category, so that I can understand where my money is going.

#### Acceptance Criteria

1. THE Dashboard_Page SHALL be accessible at the `/dashboard` route as a protected page.
2. THE Dashboard_Page SHALL display a month selector defaulting to the current month in YYYY-MM format.
3. WHEN the user selects a month, THE Dashboard_Page SHALL fetch all EXP transactions for the selected month using the existing list transactions API.
4. THE Dashboard_Page SHALL render a Pie_Chart where each slice represents one expense category.
5. THE Pie_Chart SHALL size each slice proportionally to the sum of amounts for that category relative to the total expenses.
6. THE Pie_Chart SHALL display the category name and its corresponding amount or percentage for each slice.
7. IF no EXP transactions exist for the selected month, THEN THE Dashboard_Page SHALL display a message indicating no expense data is available instead of an empty chart.
8. WHILE transaction data is being fetched, THE Dashboard_Page SHALL display a loading indicator.
9. IF the API request fails, THEN THE Dashboard_Page SHALL display an error message to the user.

### Requirement 3: Net Balance Display

**User Story:** As a user, I want to see the difference between my total income and total expenses for a given month, so that I can quickly assess my financial health.

#### Acceptance Criteria

1. THE Dashboard_Page SHALL display the Net_Balance for the selected month, computed as the sum of all INC transaction amounts minus the sum of all EXP transaction amounts.
2. THE Dashboard_Page SHALL display the total income sum and the total expense sum individually alongside the Net_Balance.
3. WHEN the Net_Balance is positive, THE Dashboard_Page SHALL display the value with a visual style indicating a surplus (e.g., green color).
4. WHEN the Net_Balance is negative, THE Dashboard_Page SHALL display the value with a visual style indicating a deficit (e.g., red color).
5. THE Dashboard_Page SHALL format all monetary values using the existing BRL currency formatter.
6. WHEN the user changes the selected month, THE Dashboard_Page SHALL recalculate and update the Net_Balance using the newly fetched transaction data.

### Requirement 4: Default Route Update

**User Story:** As a user, I want the application to open on the Dashboard page by default after login, so that I immediately see my financial summary.

#### Acceptance Criteria

1. WHEN an authenticated user navigates to the root path `/`, THE App_Layout SHALL redirect to `/dashboard`.
2. THE Dashboard_Page SHALL replace the current home page as the default landing page for authenticated users.

### Requirement 5: Session Expiration

**User Story:** As a user, I want my session to expire after 1 day of inactivity, so that my account is protected if I forget to sign out.

#### Acceptance Criteria

1. THE Cognito_User_Pool SHALL configure access token validity to 1 day.
2. THE Cognito_User_Pool SHALL configure ID token validity to 1 day.
3. WHEN a session token expires, THE AuthProvider SHALL redirect the user to the login page.
4. WHEN a session token expires, THE AuthProvider SHALL clear the local user state.
5. IF a user attempts an API request with an expired token, THEN THE App_Layout SHALL display a message indicating the session has expired and redirect to the login page.
