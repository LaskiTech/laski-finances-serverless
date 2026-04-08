# Requirements Document

## Introduction

Refactor the transaction and income navigation structure to eliminate the confusing dual-entry-point UX. Today, income can be created from two places (the standalone `/income` route and the `/transactions/new` form with a type selector), while expenses are only reachable through the transactions form. The goal is a single, unified "Transactions" section with three tab-based views — **All**, **Income**, and **Expenses** — each with its own focused creation form. No backend changes are required; the existing API endpoints and DynamoDB data model remain unchanged.

## Glossary

- **Transactions_Page**: The unified frontend page at `/transactions` that hosts All, Income, and Expenses tabs
- **All_Tab**: The default tab showing combined income and expenses for the selected period, sorted by date descending
- **Income_Tab**: The tab filtered to `type=INC` entries, with income-specific columns (Recurring badge)
- **Expenses_Tab**: The tab filtered to `type=EXP` entries, with expense-specific columns (Installment info)
- **Income_Form**: The form page at `/transactions/income/new` and `/transactions/income/edit/:sk` for creating and editing income entries (recurring-aware)
- **Expense_Form**: The form page at `/transactions/expense/new` and `/transactions/expense/edit/:sk` for creating and editing expense entries (installment-aware)
- **Nav_Drawer**: The slide-in navigation menu accessed from the header hamburger button

## Requirements

### Requirement 1: Unified Navigation Entry Point

**User Story:** As a user, I want a single "Transactions" menu item that gives me access to all my financial records, so that I don't have to guess whether income lives under "Income" or "Transactions."

#### Acceptance Criteria

1. THE Nav_Drawer SHALL contain exactly one item for financial records: **"Transactions"** at path `/transactions`.
2. THE Nav_Drawer SHALL NOT contain a standalone "Income" item.
3. THE Nav_Drawer MAY still contain "Dashboard" as the first item, unchanged.
4. THE `/income` route and all its sub-routes (`/income/new`, `/income/edit/:sk`) SHALL be removed from the router.
5. Any navigation call in the codebase that points to `/income` SHALL be updated to point to `/transactions?tab=income` or the appropriate new route.

### Requirement 2: Tab-Based Transactions Page

**User Story:** As a user, I want to switch between viewing all transactions, only income, or only expenses within the same page, so that I can get the lens I need without leaving the section.

#### Acceptance Criteria

1. THE Transactions_Page SHALL display three tabs at the top of the content area: **All**, **Income**, **Expenses**.
2. THE default active tab on page load SHALL be **All**.
3. WHEN the user clicks a tab, THE Transactions_Page SHALL switch the visible list and header without a full page navigation — tab state is managed in-component (no URL route change required for tabs, but the active tab MAY be reflected as a query param `?tab=all|income|expenses` for shareability).
4. EACH tab SHALL show a month filter (YYYY-MM input) that applies to only that tab's data fetch; switching tabs SHALL NOT reset the month filter value.
5. THE All_Tab SHALL show all transactions (income + expenses) and SHALL include a type badge column (INC/EXP) styled as green/red respectively.
6. THE Income_Tab SHALL show only `type=INC` entries and SHALL include a "Recurring" column showing a badge when `isRecurring=true`, hiding the Installment column.
7. THE Expenses_Tab SHALL show only `type=EXP` entries and SHALL include an "Installment" column (e.g., `2/6`), hiding the Recurring column.
8. EACH tab SHALL show its own "New" button scoped to that type:
   - All_Tab → "New Transaction" button opens a modal or navigates to a type-selection step (see Requirement 3)
   - Income_Tab → "New Income" button navigates to `/transactions/income/new`
   - Expenses_Tab → "New Expense" button navigates to `/transactions/expense/new`
9. WHEN no entries exist for the active tab's filters, THE Transactions_Page SHALL display an empty state message appropriate to the tab ("No income entries found." / "No expenses found." / "No transactions found.").
10. THE Transactions_Page SHALL display a loading spinner per tab while fetching data.
11. Edit and delete action buttons SHALL be present in every tab's row, navigating to the correct edit form based on the entry's `type`.

### Requirement 3: "New Transaction" Action on All Tab

**User Story:** As a user on the All tab, when I click "New Transaction," I want a clear and immediate way to choose whether I'm registering income or an expense, so that I'm taken to the right form without friction.

#### Acceptance Criteria

1. WHEN the user clicks "New Transaction" from the All_Tab, THE UI SHALL present two options: **Income** and **Expense** — either as a two-button choice displayed inline below the button, or as a simple two-item dropdown/popover.
2. WHEN the user selects "Income", they SHALL be navigated to `/transactions/income/new`.
3. WHEN the user selects "Expense", they SHALL be navigated to `/transactions/expense/new`.
4. The choice UI SHALL be dismissable without navigating away.

### Requirement 4: Income Form (Create & Edit)

**User Story:** As a user, I want a dedicated form for recording income that surfaces recurring options clearly, without irrelevant expense fields like installments.

#### Acceptance Criteria

1. THE Income_Form SHALL be accessible at:
   - Create: `/transactions/income/new`
   - Edit: `/transactions/income/edit/:sk`
2. THE Income_Form SHALL include fields: **Description** (text), **Amount** (number), **Date** (date picker), **Source** (text), **Category** (text).
3. WHEN creating, THE Income_Form SHALL include a **"Recurring income"** toggle (checkbox). When enabled, it SHALL reveal: Frequency (monthly/weekly select), Ends by (occurrences or end date select), and the corresponding occurrences count or end date input.
4. THE Income_Form SHALL NOT include a type selector (it is always `INC`) and SHALL NOT include an installments field.
5. WHEN editing a recurring income entry, THE Income_Form SHALL ask whether to update only this entry or this and all future entries in the series (via a confirmation dialog after clicking Update).
6. On successful create, THE Income_Form SHALL navigate back to `/transactions?tab=income`.
7. On successful edit, THE Income_Form SHALL navigate back to `/transactions?tab=income`.
8. The Cancel button SHALL navigate back to `/transactions?tab=income`.
9. THE Income_Form SHALL validate all required fields client-side before submission and display inline error messages.
10. IF the API returns an error, THE Income_Form SHALL display it inline without navigating away.
11. THE Income_Form SHALL call POST `/transactions` with `type: "INC"` for creation, and PUT `/transactions/:sk` for updates — no new backend endpoint is needed.

### Requirement 5: Expense Form (Create & Edit)

**User Story:** As a user, I want a dedicated form for recording expenses that makes installments intuitive, without unrelated income fields like recurring options.

#### Acceptance Criteria

1. THE Expense_Form SHALL be accessible at:
   - Create: `/transactions/expense/new`
   - Edit: `/transactions/expense/edit/:sk`
2. THE Expense_Form SHALL include fields: **Description** (text), **Amount** (number, represents the total purchase value), **Date** (date picker), **Source** (text), **Category** (text).
3. WHEN creating, THE Expense_Form SHALL include an **Installments** field (integer input, default 1, minimum 1). When set to more than 1, a helper text SHALL appear: "Amount will be split into N monthly payments of R$ X.XX each."
4. THE Expense_Form SHALL NOT include a type selector (it is always `EXP`) and SHALL NOT include recurring options.
5. WHEN editing an installment entry, THE Expense_Form SHALL hide the installments field (individual installments are edited independently, per existing backend behavior).
6. On successful create, THE Expense_Form SHALL navigate back to `/transactions?tab=expenses`.
7. On successful edit, THE Expense_Form SHALL navigate back to `/transactions?tab=expenses`.
8. The Cancel button SHALL navigate back to `/transactions?tab=expenses`.
9. THE Expense_Form SHALL validate all required fields client-side before submission and display inline error messages.
10. IF the API returns an error, THE Expense_Form SHALL display it inline without navigating away.
11. THE Expense_Form SHALL call POST `/transactions` with `type: "EXP"` for creation, and PUT `/transactions/:sk` for updates — no new backend endpoint is needed.

### Requirement 6: Edit Routing from the Unified List

**User Story:** As a user, when I click Edit on any row in any tab, I want to be taken to the correct form for that entry's type.

#### Acceptance Criteria

1. WHEN the user clicks Edit on a row where `type === "INC"`, they SHALL be navigated to `/transactions/income/edit/:sk`.
2. WHEN the user clicks Edit on a row where `type === "EXP"`, they SHALL be navigated to `/transactions/expense/edit/:sk`.
3. THE edit forms SHALL pre-populate all editable fields with the existing entry's data fetched from GET `/transactions/:sk`.
4. The existing `/transactions/edit/:sk` route (generic form) SHALL be removed once the type-specific edit routes are in place.

### Requirement 7: Router and Legacy Route Cleanup

**User Story:** As a developer, I want the router to be clean and unambiguous, so that there are no dead or duplicate routes that confuse navigation.

#### Acceptance Criteria

1. THE following routes SHALL be removed: `/income`, `/income/new`, `/income/edit/:sk`, `/transactions/new`, `/transactions/edit/:sk`.
2. THE following routes SHALL be added: `/transactions/income/new`, `/transactions/income/edit/:sk`, `/transactions/expense/new`, `/transactions/expense/edit/:sk`.
3. `IncomePage` component SHALL be removed or repurposed as the Income_Tab sub-component (not a standalone page).
4. `IncomeFormPage` component SHALL be renamed or replaced by the new `IncomeFormPage` at the new route; its internal `navigate('/income')` calls SHALL be updated to `navigate('/transactions?tab=income')`.
5. `TransactionFormPage` (the generic form with type selector) SHALL be removed; it is superseded by `IncomeFormPage` and `ExpenseFormPage`.

### Requirement 8: No Backend Changes

**User Story:** As a developer, I want to confirm that this UX refactor does not require any backend Lambda, CDK, or DynamoDB changes.

#### Acceptance Criteria

1. THE existing `/transactions` API endpoints (POST, GET, GET/:sk, PUT/:sk, DELETE/:sk) SHALL remain unchanged.
2. THE existing `/income` API endpoints SHALL remain unchanged (they are used by the Income_Form via the existing `front/src/api/income.ts` client).
3. THE DynamoDB data model SHALL remain unchanged.
4. No new CDK stacks, Lambda functions, or IAM grants are required for this change.
