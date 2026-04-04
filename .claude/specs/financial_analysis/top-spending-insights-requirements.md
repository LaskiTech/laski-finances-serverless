# Requirements Document — Top Spending Insights

## Introduction

Top Spending Insights gives users a ranked breakdown of where their money goes and where it comes from within a given month. Two read-only Lambda handlers serve two endpoints: `GET /insights/top-spending` ranks expense categories by total amount, and `GET /insights/top-sources` ranks income sources by total amount. Both return a `share` value (fraction of the relevant total) so the frontend can render progress bars without a second API call.

Both handlers query `laskifin-Ledger` directly and aggregate results in Lambda. They are compute-on-read — no pre-aggregated data beyond what is already in the Ledger. This is consistent with the existing design decision in `data-model.md` ("Balance and insights are computed on-read").

All coding standards in `coding-standards.md` apply without exception.

## Glossary

- **Top_Spending_Handler**: The Lambda function `top-spending.ts` returning ranked expense categories.
- **Top_Sources_Handler**: The Lambda function `top-sources.ts` returning ranked income sources.
- **Insights_API**: The API Gateway resources `/insights/top-spending` and `/insights/top-sources`.
- **Category_Total**: The sum of `amount` across all EXP entries for a given category within the requested month.
- **Source_Total**: The sum of `amount` across all INC entries for a given source within the requested month.
- **Share**: A decimal fraction in the range [0, 1] representing a category or source's portion of the total. Computed as `Category_Total / totalExpenses` or `Source_Total / totalIncome`. Used directly as a progress bar fill ratio on the frontend.
- **Ledger_Table**: The DynamoDB table `laskifin-Ledger`.
- **GSI_MonthlyByCategory**: The Global Secondary Index on `laskifin-Ledger` with `pk` as partition key and `categoryMonth` as sort key. Used by `top-spending.ts` to retrieve expense entries for a given month.
- **Insights_Widget**: The frontend React component displaying both top-spending and top-sources results on the dashboard.

## Requirements

### Requirement 1: Top Spending by Category

**User Story:** As a user, I want to see which expense categories consumed the most money this month, so that I know where to focus if I want to reduce spending.

#### Acceptance Criteria

1. WHEN the user sends `GET /insights/top-spending`, THE Top_Spending_Handler SHALL return the ranked list of expense categories for the current calendar month (UTC).
2. WHEN the `month` query parameter is provided (format YYYY-MM), THE Top_Spending_Handler SHALL return ranked categories for that month instead.
3. THE Top_Spending_Handler SHALL query `GSI_MonthlyByCategory` with `pk = USER#<cognitoSub>` and apply a `FilterExpression` of `#type = :exp` (where `:exp = "EXP"`) to retrieve only expense entries. The sort key condition SHALL use `begins_with(categoryMonth, :month)` where `:month` is the YYYY-MM string, to retrieve only entries whose `categoryMonth` ends with the requested month.
4. THE Top_Spending_Handler SHALL aggregate results in Lambda: group all returned items by `category`, summing `amount` per group to produce each `Category_Total`.
5. THE response SHALL contain: `month` (YYYY-MM string), `totalExpenses` (sum of all EXP amounts for the month across all categories), a `categories` array, and a `limit` field reflecting the number of categories returned.
6. EACH entry in the `categories` array SHALL contain: `category` (string), `total` (Category_Total), and `share` (Category_Total divided by `totalExpenses`, rounded to 4 decimal places). If `totalExpenses` is zero, `share` SHALL be `0` for all entries.
7. THE `categories` array SHALL be sorted in descending order of `total` (highest spender first).
8. WHEN the `limit` query parameter is provided as a positive integer between 1 and 20 inclusive, THE Top_Spending_Handler SHALL return at most `limit` categories after sorting. When `limit` is absent, it SHALL default to `5`.
9. WHEN `limit` is provided but is not a positive integer or exceeds 20, THE Top_Spending_Handler SHALL return HTTP 400.
10. WHEN no expense entries exist for the requested month, THE Top_Spending_Handler SHALL return HTTP 200 with `totalExpenses = 0` and an empty `categories` array.
11. WHEN the `month` parameter does not match the format `YYYY-MM` or represents an invalid date, THE Top_Spending_Handler SHALL return HTTP 400.
12. IF the Cognito sub claim is missing, THE Top_Spending_Handler SHALL return HTTP 401.

### Requirement 2: Top Income Sources

**User Story:** As a user, I want to see which income sources contributed the most money this month, so that I understand what my income depends on.

#### Acceptance Criteria

1. WHEN the user sends `GET /insights/top-sources`, THE Top_Sources_Handler SHALL return the ranked list of income sources for the current calendar month (UTC).
2. WHEN the `month` query parameter is provided (format YYYY-MM), THE Top_Sources_Handler SHALL return ranked sources for that month.
3. THE Top_Sources_Handler SHALL query `laskifin-Ledger` directly (not `GSI_LookupBySource`) using `pk = USER#<cognitoSub>` and `sk begins_with TRANS#<YYYY-MM>#INC#` to retrieve all income entries for the requested month in a single key-condition query.
4. THE Top_Sources_Handler SHALL aggregate results in Lambda: group all returned items by `source`, summing `amount` per group to produce each `Source_Total`.
5. THE response SHALL contain: `month` (YYYY-MM string), `totalIncome` (sum of all INC amounts for the month across all sources), a `sources` array, and a `limit` field reflecting the number of sources returned.
6. EACH entry in the `sources` array SHALL contain: `source` (string), `total` (Source_Total), and `share` (Source_Total divided by `totalIncome`, rounded to 4 decimal places). If `totalIncome` is zero, `share` SHALL be `0` for all entries.
7. THE `sources` array SHALL be sorted in descending order of `total` (highest contributor first).
8. WHEN the `limit` query parameter is provided as a positive integer between 1 and 20 inclusive, THE Top_Sources_Handler SHALL return at most `limit` sources. When `limit` is absent, it SHALL default to `5`.
9. WHEN `limit` is provided but is not a positive integer or exceeds 20, THE Top_Sources_Handler SHALL return HTTP 400.
10. WHEN no income entries exist for the requested month, THE Top_Sources_Handler SHALL return HTTP 200 with `totalIncome = 0` and an empty `sources` array.
11. WHEN the `month` parameter does not match the format `YYYY-MM` or represents an invalid date, THE Top_Sources_Handler SHALL return HTTP 400.
12. IF the Cognito sub claim is missing, THE Top_Sources_Handler SHALL return HTTP 401.

### Requirement 3: Insights Widget

**User Story:** As a user, I want to see my top spending categories and income sources side by side on the dashboard, so that I can understand my financial behaviour at a glance.

#### Acceptance Criteria

1. THE Insights_Widget SHALL be displayed on the Dashboard_Page below the Balance_Widget.
2. ON page load, THE Insights_Widget SHALL fetch both `GET /insights/top-spending` and `GET /insights/top-sources` in parallel for the current month.
3. THE Insights_Widget SHALL display top-spending results as a ranked list where each category row shows: rank number, category name, total amount (BRL), and a horizontal progress bar filled to `share` width.
4. THE Insights_Widget SHALL display top-sources results in the same format: rank number, source name, total amount (BRL), and a progress bar filled to `share` width.
5. THE Insights_Widget SHALL include a month selector that, when changed, re-fetches both endpoints for the new month.
6. THE Insights_Widget SHALL display a loading skeleton while fetches are in progress.
7. WHEN either endpoint returns an empty result, THE Insights_Widget SHALL display a message indicating no data is available for that section (e.g. "No expenses recorded this month").
8. IF either fetch fails, THE Insights_Widget SHALL display an inline error for that section with a retry button, without hiding the other section.
9. ALL amounts SHALL be formatted as BRL currency using `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
10. THE Insights_Widget SHALL not allow navigating to months in the future beyond the current calendar month.

### Requirement 4: API Gateway and CDK Infrastructure

**User Story:** As a developer, I want both insights endpoints wired through API Gateway with Cognito authorisation and read-only DynamoDB permissions, so that they are secure and correctly deployed.

#### Acceptance Criteria

1. THE Insights_API SHALL expose `GET /insights/top-spending` and `GET /insights/top-sources` on the existing API Gateway.
2. Both routes SHALL require Cognito User Pool authorisation.
3. Each handler SHALL be a `NodejsFunction` with Node.js 22.x runtime, 256 MB memory, 10 s timeout, esbuild minify + sourceMap.
4. Both handlers SHALL be granted `grantReadData` on `laskifin-Ledger` only. Neither handler accesses `laskifin-MonthlySummary`.
5. Both handlers SHALL receive `TABLE_NAME` (Ledger) as an environment variable and SHALL NOT receive `SUMMARY_TABLE_NAME`.
6. Both routes SHALL be configured with CORS to allow the frontend origin.
