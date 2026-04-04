# Requirements Document — Balance Overview

## Introduction

The Balance Overview feature gives users a clear financial picture for any time period: how much they earned, how much they spent, and what they kept. It is read-only — no writes, no business logic, no side effects. A single Lambda handler (`get-balance.ts`) reads pre-aggregated data from `laskifin-MonthlySummary` and returns a structured summary. The feature includes a frontend dashboard widget that displays the balance for the current month by default, with controls to browse other months or request a custom date range.

The pre-aggregation strategy is documented in `data-model.md`: every income and expense write handler maintains `laskifin-MonthlySummary` atomically, so balance reads are O(1) per month regardless of transaction volume. `get-balance.ts` never reads from `laskifin-Ledger`.

All coding standards in `coding-standards.md` apply without exception.

## Glossary

- **Balance_Handler**: The Lambda function `get-balance.ts` responsible for reading `laskifin-MonthlySummary` and returning balance data.
- **MonthlySummary_Table**: The DynamoDB table `laskifin-MonthlySummary`. Each item stores pre-aggregated totals for one user for one calendar month, keyed as `pk = USER#<sub>`, `sk = SUMMARY#<YYYY-MM>`.
- **Single_Month_Mode**: The query mode activated when the `month` parameter is provided, or when no parameters are given (defaults to the current calendar month). Returns one summary item.
- **Range_Mode**: The query mode activated when both `from` and `to` parameters are provided. Returns one summary item per month in the range, plus aggregated totals.
- **Empty_Month**: A calendar month within a requested range for which no `laskifin-MonthlySummary` item exists because no transactions were recorded in that month. The handler zero-fills these months in the response rather than omitting them.
- **Balance_Widget**: The frontend React component that displays the balance summary on the dashboard.
- **Dashboard_Page**: The main application page shown after login, which hosts the Balance_Widget alongside other summary components.

## Requirements

### Requirement 1: Single-Month Balance

**User Story:** As a user, I want to see my income, expenses, and net balance for a specific month at a glance, so that I can quickly understand my financial health for that period.

#### Acceptance Criteria

1. WHEN the user sends `GET /balance` with no query parameters, THE Balance_Handler SHALL return the summary for the current calendar month (the month containing today's date, evaluated in UTC).
2. WHEN the user sends `GET /balance?month=YYYY-MM`, THE Balance_Handler SHALL return the summary for the specified month.
3. THE Balance_Handler SHALL retrieve the summary using a `GetCommand` on `laskifin-MonthlySummary` with `pk = USER#<cognitoSub>` and `sk = SUMMARY#<YYYY-MM>`.
4. THE response SHALL contain: `month` (YYYY-MM string), `totalIncome` (number), `totalExpenses` (number), `balance` (number), and `transactionCount` (number).
5. THE `balance` field in the response SHALL be computed by the handler as `totalIncome - totalExpenses` from the retrieved item's stored values — it SHALL NOT use the stored `balance` attribute directly, because the stored value may drift from the correct figure under concurrent writes.
6. WHEN no summary item exists for the requested month (no transactions were ever recorded for that month), THE Balance_Handler SHALL return HTTP 200 with all numeric fields set to `0` — it SHALL NOT return HTTP 404.
7. WHEN the `month` parameter does not match the format `YYYY-MM`, or represents an invalid date (e.g. `2024-13`), THE Balance_Handler SHALL return HTTP 400 with a descriptive error message.
8. WHEN both `month` and either `from` or `to` are present in the same request, THE Balance_Handler SHALL return HTTP 400 — the parameters are mutually exclusive.
9. IF the Cognito sub claim is missing from the request context, THE Balance_Handler SHALL return HTTP 401.

### Requirement 2: Range Balance

**User Story:** As a user, I want to see my income and expenses across a span of months, so that I can track trends and understand my financial trajectory over time.

#### Acceptance Criteria

1. WHEN the user sends `GET /balance?from=YYYY-MM&to=YYYY-MM`, THE Balance_Handler SHALL return summaries for every calendar month from `from` to `to`, inclusive.
2. THE Balance_Handler SHALL retrieve range data using a `QueryCommand` on `laskifin-MonthlySummary` with `pk = USER#<cognitoSub>` and `KeyConditionExpression: sk BETWEEN SUMMARY#<from> AND SUMMARY#<to>`.
3. THE response `months` array SHALL contain one entry per calendar month in the range — including Empty_Months. Empty_Months SHALL appear with all numeric fields set to `0`.
4. THE response `months` array SHALL be sorted in ascending chronological order (earliest month first).
5. THE response SHALL include a `totals` object computed by the handler in Lambda: `totalIncome` is the sum of `totalIncome` across all months (including zeros for Empty_Months), `totalExpenses` is the sum of `totalExpenses`, and `balance` is `totals.totalIncome - totals.totalExpenses`.
6. WHEN `from` is chronologically after `to`, THE Balance_Handler SHALL return HTTP 400.
7. WHEN the range spans more than 24 calendar months, THE Balance_Handler SHALL return HTTP 400 with a message indicating the maximum range is 24 months.
8. WHEN either `from` or `to` is provided without the other, THE Balance_Handler SHALL return HTTP 400.
9. WHEN `from` or `to` does not match the format `YYYY-MM` or represents an invalid date, THE Balance_Handler SHALL return HTTP 400.
10. IF the Cognito sub claim is missing, THE Balance_Handler SHALL return HTTP 401.

### Requirement 3: Balance Widget — Current Month View

**User Story:** As a user, I want to see my current month's balance prominently on my dashboard as soon as I log in, so that I have an immediate sense of where I stand financially.

#### Acceptance Criteria

1. THE Balance_Widget SHALL be displayed on the Dashboard_Page, visible without scrolling on a standard desktop viewport.
2. ON page load, THE Balance_Widget SHALL automatically fetch `GET /balance` (no parameters) to retrieve the current month's summary.
3. THE Balance_Widget SHALL display: the current month label (e.g. "June 2024"), total income, total expenses, and net balance — each formatted as BRL currency.
4. THE net balance value SHALL be coloured green (`var(--color-text-success)`) when positive or zero, and red (`var(--color-text-danger)`) when negative.
5. THE Balance_Widget SHALL display a loading skeleton while the initial fetch is in progress.
6. IF the fetch fails, THE Balance_Widget SHALL display an inline error message with a retry button, without hiding other dashboard content.
7. THE Balance_Widget SHALL include previous and next month navigation controls (chevron buttons). Each navigation step fetches `GET /balance?month=YYYY-MM` for the target month.
8. THE next-month chevron SHALL be disabled when the currently displayed month is the current calendar month, preventing navigation into the future.
9. THE Balance_Widget SHALL include a "View range" button that expands an inline range selector (from/to month pickers) and transitions the widget to Range_Mode when submitted.

### Requirement 4: Balance Widget — Range View

**User Story:** As a user, I want to explore my balance across a range of months directly from the dashboard, so that I can spot income and spending trends without navigating away.

#### Acceptance Criteria

1. WHEN the user submits a valid from/to selection, THE Balance_Widget SHALL transition to Range_Mode, replacing the single-month card with a range summary that shows: the `from` and `to` labels, a monthly breakdown table, and the range `totals`.
2. THE monthly breakdown SHALL display one row per month in the range, with columns: month label, income, expenses, and balance. Empty_Month rows SHALL appear with `R$ 0,00` in all value columns.
3. THE `totals` row SHALL appear at the bottom of the table with visually distinct formatting (bold or background contrast), summarising income, expenses, and net balance across the range.
4. THE Balance_Widget SHALL prevent submission of a range where `from` is after `to`, showing an inline validation error without sending any request.
5. THE Balance_Widget SHALL prevent submission of a range spanning more than 24 months, showing an inline validation error.
6. WHEN the user clicks "Back to month view", THE Balance_Widget SHALL return to Single_Month_Mode showing the current calendar month.
7. ALL numeric values in both modes SHALL be formatted as BRL currency using `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

### Requirement 5: API Gateway and CDK Infrastructure

**User Story:** As a developer, I want the balance endpoint wired through API Gateway with Cognito authorisation and read-only permissions, so that it is secure and correctly deployed alongside the other feature endpoints.

#### Acceptance Criteria

1. THE Balance_Handler SHALL be exposed as `GET /balance` on the existing API Gateway.
2. THE `GET /balance` route SHALL require Cognito User Pool authorisation.
3. THE Balance_Handler SHALL be a `NodejsFunction` with Node.js 22.x runtime, 256 MB memory, 10 s timeout, esbuild minify + sourceMap.
4. THE Balance_Handler SHALL be granted `grantReadData` on `laskifin-MonthlySummary` only — it requires no access to `laskifin-Ledger`.
5. THE Balance_Handler SHALL receive `SUMMARY_TABLE_NAME` as an environment variable and SHALL NOT receive `TABLE_NAME`.
6. THE `GET /balance` route SHALL be configured with CORS to allow the frontend origin.
