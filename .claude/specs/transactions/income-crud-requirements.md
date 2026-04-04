# Requirements Document — Income CRUD

## Introduction

Income CRUD enables users of LASKI Finances to record, browse, edit, and delete income entries through a web interface backed by REST APIs and Lambda handlers. Income entries are stored in the existing `laskifin-Ledger` DynamoDB table with `type = "INC"` and share its sort key schema with expense entries. The distinctive capability of income over basic transaction recording is **recurrence**: a single income entry (e.g. a monthly salary) can generate a series of future entries that share a `recurringId`, which can then be updated or deleted as a group from a chosen date forward.

This document is a sibling to `transaction-crud-requirements.md`. It follows the same structure, conventions, and terminology. All coding standards in `coding-standards.md` apply without exception.

## Glossary

- **Income_API**: The REST API Gateway resource (`/income`) handling HTTP requests for income operations.
- **Create_Income_Handler**: The Lambda function responsible for creating one or more income entries in the Ledger_Table.
- **List_Income_Handler**: The Lambda function responsible for querying and returning income entries from the Ledger_Table.
- **Get_Income_Handler**: The Lambda function responsible for retrieving a single income entry by sort key.
- **Update_Income_Handler**: The Lambda function responsible for modifying one or all future entries of a recurrence series.
- **Delete_Income_Handler**: The Lambda function responsible for removing one or all future entries of a recurrence series.
- **Income_Form**: The frontend page used to create or edit an income entry.
- **Income_List_Page**: The frontend page displaying all income entries for the authenticated user.
- **Ledger_Table**: The DynamoDB table (`laskifin-Ledger`) storing all transaction records, shared between income and expense entries.
- **MonthlySummary_Table**: The DynamoDB table (`laskifin-MonthlySummary`) storing pre-aggregated monthly totals. Every handler that writes to the Ledger_Table must also update this table atomically.
- **Recurrence_Series**: A set of income entries sharing the same `recurringId`, representing the same recurring income source (e.g. a monthly salary) projected across multiple months.
- **Future_Group**: The subset of a Recurrence_Series whose `date` is greater than or equal to a reference entry's `date`. Update and delete group operations apply only to the Future_Group, never to past entries.
- **One_Time_Income**: An income entry created without a `recurrence` field. Has no `recurringId` and `isRecurring` is omitted.
- **User_Partition**: The DynamoDB partition key pattern `USER#<cognitoSub>` that isolates each user's data.

## Requirements

### Requirement 1: Create Income Entry

**User Story:** As a user, I want to record an income entry — either a one-time payment or a recurring income — so that my financial picture includes all money coming in.

#### Acceptance Criteria

1. WHEN the user submits a valid income payload via `POST /income`, THE Create_Income_Handler SHALL create one or more entries in the Ledger_Table and return HTTP 201 with a success message, the `recurringId` (always present, equals `groupId`), and the count of entries created.
2. THE Create_Income_Handler SHALL validate that the payload contains: `description` (non-empty string), `totalAmount` (positive number), `date` (valid ISO 8601 date string), `source` (non-empty string), and `category` (non-empty string). The `type` field is not accepted in the request body — it is always set to `"INC"` by the handler.
3. WHEN the `recurrence` field is omitted, THE Create_Income_Handler SHALL create a single One_Time_Income entry with `amount` equal to `totalAmount`, `installmentNumber` set to 1, `installmentTotal` set to 1, `isRecurring` omitted, and a `groupId` assigned (equal to `recurringId`).
4. WHEN the `recurrence` field is provided, THE Create_Income_Handler SHALL validate that it contains `frequency` (`"monthly"` or `"weekly"`) and exactly one of `endDate` (valid ISO 8601 date string) or `occurrences` (positive integer). If both or neither are provided, the handler SHALL return HTTP 400.
5. WHEN `recurrence.frequency` is `"monthly"` and `endDate` is provided, THE Create_Income_Handler SHALL create one entry per calendar month from the `date` up to and including the month of `endDate`, each dated on the same day-of-month as the original `date`.
6. WHEN `recurrence.frequency` is `"monthly"` and `occurrences` is provided, THE Create_Income_Handler SHALL create exactly `occurrences` entries, each dated one calendar month apart starting from `date`.
7. WHEN `recurrence.frequency` is `"weekly"` and `endDate` is provided, THE Create_Income_Handler SHALL create one entry per week (every 7 days) from `date` up to and including `endDate`.
8. WHEN `recurrence.frequency` is `"weekly"` and `occurrences` is provided, THE Create_Income_Handler SHALL create exactly `occurrences` entries, each dated 7 days apart starting from `date`.
9. FOR every entry in a Recurrence_Series, THE Create_Income_Handler SHALL set: `amount` equal to `totalAmount`, `isRecurring` to `true`, `recurringId` to a single newly generated UUID shared across all entries, `groupId` equal to `recurringId`, `installmentNumber` to 1, and `installmentTotal` to 1.
10. FOR every entry created (one-time or recurring), THE Create_Income_Handler SHALL set: `pk` to `USER#<cognitoSub>`, `sk` to `TRANS#<YYYY-MM>#INC#<uuid>` where `YYYY-MM` is derived from that entry's `date`, `type` to `"INC"`, `categoryMonth` to `category + "#" + YYYY-MM`, and `createdAt` to the current ISO 8601 timestamp.
11. FOR every entry created, THE Create_Income_Handler SHALL atomically update `laskifin-MonthlySummary` by adding `amount` to `totalIncome`, incrementing `transactionCount` by 1, and recalculating `balance`, initialising the summary item if it does not yet exist for that month.
12. IF the request body is missing or contains invalid JSON, THEN THE Create_Income_Handler SHALL return HTTP 400 with a descriptive error message.
13. IF Zod validation fails on any field, THEN THE Create_Income_Handler SHALL return HTTP 400 with the list of validation error messages.
14. IF the Cognito sub claim is missing from the request context, THEN THE Create_Income_Handler SHALL return HTTP 401 with an "Unauthorized" error.
15. IF the computed number of entries to create exceeds 500, THEN THE Create_Income_Handler SHALL return HTTP 400 with an error stating the recurrence range is too large.

### Requirement 2: List Income Entries

**User Story:** As a user, I want to see a list of all my income entries, optionally filtered by month or limited to recurring entries, so that I can review what money is coming in.

#### Acceptance Criteria

1. WHEN the user sends `GET /income`, THE List_Income_Handler SHALL return HTTP 200 with all income entries for the authenticated user from the Ledger_Table.
2. THE List_Income_Handler SHALL query the Ledger_Table using partition key `USER#<cognitoSub>` and sort key prefix `TRANS#` with an additional `begins_with` filter fixing the type segment to `INC` (i.e. prefix `TRANS#` → `TRANS#YYYY-MM#INC#` when `month` is provided).
3. WHERE the `month` query parameter is provided (format YYYY-MM), THE List_Income_Handler SHALL narrow the sort key prefix to `TRANS#<YYYY-MM>#INC#`, returning only entries for that month.
4. WHERE the `recurring` query parameter is `"true"`, THE List_Income_Handler SHALL apply a `FilterExpression` of `isRecurring = true` after the key condition query, returning only recurring entries.
5. THE List_Income_Handler SHALL return entries sorted by date in descending order (`ScanIndexForward: false`).
6. WHEN no entries match the applied filters, THE List_Income_Handler SHALL return HTTP 200 with an empty `income` array.
7. IF the Cognito sub claim is missing, THEN THE List_Income_Handler SHALL return HTTP 401.

### Requirement 3: Get Income Entry Detail

**User Story:** As a user, I want to retrieve the full details of a single income entry, so that the edit form can be pre-populated accurately.

#### Acceptance Criteria

1. WHEN the user sends `GET /income/{sk}`, THE Get_Income_Handler SHALL return HTTP 200 with the full income item from the Ledger_Table.
2. THE Get_Income_Handler SHALL retrieve the item using partition key `USER#<cognitoSub>` and the provided `sk` path parameter.
3. IF no item exists for the given key pair, THEN THE Get_Income_Handler SHALL return HTTP 404 with an "Income entry not found" error.
4. IF the retrieved item has `type` other than `"INC"`, THEN THE Get_Income_Handler SHALL return HTTP 404 — the endpoint must not expose expense entries.
5. IF the Cognito sub claim is missing, THEN THE Get_Income_Handler SHALL return HTTP 401.

### Requirement 4: Update Income Entry

**User Story:** As a user, I want to update an income entry — either just one occurrence or all future occurrences of a recurring series — so that I can correct mistakes or reflect changes in my income.

#### Acceptance Criteria

1. WHEN the user sends `PUT /income/{sk}` with a valid payload, THE Update_Income_Handler SHALL update the specified entry and return HTTP 200 with the updated item or items.
2. THE Update_Income_Handler SHALL allow updating the following fields: `description`, `amount`, `date`, `source`, and `category`. The `type` field is not updatable — it remains `"INC"`.
3. THE Update_Income_Handler SHALL validate the update payload using Zod: `description` (non-empty string), `amount` (positive number), `date` (valid ISO 8601 date string), `source` (non-empty string), `category` (non-empty string).
4. WHEN the `updateGroup` query parameter is absent or `"false"`, THE Update_Income_Handler SHALL update only the single entry at `{sk}` using a `UpdateCommand` with `ConditionExpression: "attribute_exists(pk)"`.
5. WHEN the `updateGroup` query parameter is `"true"`, THE Update_Income_Handler SHALL update the Future_Group: all entries sharing the same `recurringId` as the item at `{sk}` whose `date` is greater than or equal to the item's current `date`. Entries with `date` before the item's `date` SHALL NOT be modified.
6. FOR each updated entry, THE Update_Income_Handler SHALL recalculate `categoryMonth` as `category + "#" + YYYY-MM` derived from the updated `date`, and update `laskifin-MonthlySummary` by subtracting the old `amount` from `totalIncome` and adding the new `amount`, in a single `UpdateCommand` per affected month.
7. IF the item at `{sk}` does not exist, THEN THE Update_Income_Handler SHALL return HTTP 404 with an "Income entry not found" error.
8. IF `updateGroup=true` but the item is not part of a Recurrence_Series (`isRecurring` is falsy or absent), THEN THE Update_Income_Handler SHALL update only the single entry and return HTTP 200 — the flag is silently ignored for non-recurring entries.
9. IF Zod validation fails, THEN THE Update_Income_Handler SHALL return HTTP 400.
10. IF the Cognito sub claim is missing, THEN THE Update_Income_Handler SHALL return HTTP 401.

### Requirement 5: Delete Income Entry

**User Story:** As a user, I want to delete an income entry — either just one occurrence or all future occurrences of a recurring series — so that I can remove incorrect or cancelled income from my records.

#### Acceptance Criteria

1. WHEN the user sends `DELETE /income/{sk}`, THE Delete_Income_Handler SHALL remove the specified entry and return HTTP 200 with a success message.
2. WHEN the `deleteGroup` query parameter is absent or `"false"`, THE Delete_Income_Handler SHALL delete only the single entry at `{sk}`.
3. WHEN the `deleteGroup` query parameter is `"true"`, THE Delete_Income_Handler SHALL delete the Future_Group: all entries sharing the same `recurringId` as the item at `{sk}` whose `date` is greater than or equal to the item's current `date`.
4. FOR each deleted entry, THE Delete_Income_Handler SHALL atomically update `laskifin-MonthlySummary` by subtracting the entry's `amount` from `totalIncome` and decrementing `transactionCount`.
5. IF no item exists at `{sk}` for the authenticated user, THEN THE Delete_Income_Handler SHALL return HTTP 404 with an "Income entry not found" error.
6. IF `deleteGroup=true` but the item is not part of a Recurrence_Series, THE Delete_Income_Handler SHALL delete only the single entry and return HTTP 200 — the flag is silently ignored for non-recurring entries.
7. THE Delete_Income_Handler SHALL return the count of deleted entries in the response body.
8. IF the Cognito sub claim is missing, THEN THE Delete_Income_Handler SHALL return HTTP 401.

### Requirement 6: Income List Page

**User Story:** As a user, I want a page that shows all my income entries in a table so that I can review and manage what money is coming in.

#### Acceptance Criteria

1. THE Income_List_Page SHALL display a table with columns: date, description, category, source, amount, and recurrence indicator (a badge showing "Recurring" for entries where `isRecurring` is true).
2. THE Income_List_Page SHALL fetch income entries from `GET /income` on page load using the authenticated user's token.
3. THE Income_List_Page SHALL provide a month filter (`<input type="month">`) that re-fetches entries for the selected month.
4. THE Income_List_Page SHALL provide a "Show recurring only" toggle that re-fetches with `recurring=true`.
5. THE Income_List_Page SHALL display a loading indicator while entries are being fetched.
6. WHEN the income list is empty, THE Income_List_Page SHALL display a message indicating no income entries were found.
7. THE Income_List_Page SHALL provide a "New Income" button that navigates to the Income_Form for creation.
8. THE Income_List_Page SHALL provide edit and delete action buttons for each row.
9. WHEN the user clicks delete for a One_Time_Income entry, THE Income_List_Page SHALL display a simple confirmation dialog before sending the delete request.
10. WHEN the user clicks delete for a recurring entry, THE Income_List_Page SHALL display a dialog offering two choices: "Delete this entry only" or "Delete this and all future entries". The user's choice SHALL determine whether `deleteGroup=true` is sent.
11. THE Income_List_Page SHALL format amounts as BRL currency (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`) and dates as `DD/MM/YYYY`.

### Requirement 7: Income Create/Edit Form Page

**User Story:** As a user, I want a form to create or edit income entries, so that I can input or correct my income data conveniently.

#### Acceptance Criteria

1. THE Income_Form SHALL include fields for: description (text input), totalAmount (number input), date (date input), source (text input), category (text input), and a recurrence section with frequency select (`monthly` or `weekly`) and either endDate or occurrences.
2. THE Income_Form SHALL show the recurrence section only when the user activates a "Recurring income" toggle. When the toggle is off, no `recurrence` field is sent.
3. WITHIN the recurrence section, the user SHALL choose between "Until date" (shows a date input) and "Number of occurrences" (shows a number input). Both options are mutually exclusive.
4. THE Income_Form SHALL validate all fields client-side before submission, showing inline error messages for invalid fields.
5. WHEN used for creation, THE Income_Form SHALL send a `POST /income` request and navigate to the Income_List_Page on success.
6. WHEN used for editing, THE Income_Form SHALL fetch the existing entry from `GET /income/{sk}`, pre-populate all fields, and hide the recurrence section entirely — recurrence series are not reconfigured via the edit form.
7. WHEN used for editing, THE Income_Form SHALL send a `PUT /income/{sk}` request. For recurring entries, it SHALL present a choice ("Update this entry only" or "Update this and all future entries") before submitting, which sets the `updateGroup` query parameter accordingly.
8. THE Income_Form SHALL display a loading state on the submit button while the API request is in progress and prevent duplicate submissions.
9. IF the API returns an error, THE Income_Form SHALL display the error message without navigating away.

### Requirement 8: API Gateway and CDK Infrastructure

**User Story:** As a developer, I want all income CRUD endpoints wired through API Gateway with Cognito authorisation and least-privilege Lambda permissions, so that the backend is secure and correctly deployed.

#### Acceptance Criteria

1. THE Income_API SHALL expose the following routes: `POST /income`, `GET /income`, `GET /income/{sk}`, `PUT /income/{sk}`, `DELETE /income/{sk}`.
2. THE Income_API SHALL require Cognito User Pool authorisation on all routes.
3. THE Income_API SHALL use one `NodejsFunction` per operation (create, list, get, update, delete), each with Node.js 22.x runtime, 256 MB memory, 10 s timeout, esbuild minify + sourceMap.
4. THE Income_API SHALL grant least-privilege DynamoDB permissions: `grantReadData` for list and get handlers; `grantWriteData` on Ledger + `grantReadWriteData` on MonthlySummary for the create handler; `grantReadWriteData` on both Ledger and MonthlySummary for update and delete handlers.
5. ALL income Lambda functions SHALL receive `TABLE_NAME` (Ledger) and `SUMMARY_TABLE_NAME` (MonthlySummary) as environment variables.
6. THE Income_API SHALL configure CORS to allow the frontend origin for all routes.
