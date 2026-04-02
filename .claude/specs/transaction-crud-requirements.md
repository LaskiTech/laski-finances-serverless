# Requirements Document

## Introduction

Complete CRUD (Create, Read, Update, Delete) feature for financial transactions in LASKI Finances. This feature enables users to manage their ledger entries (income and expenses) through a web interface backed by REST APIs, Lambda handlers, and the existing DynamoDB Ledger table. It covers creating single and installment-based transactions, listing/querying transactions, viewing transaction details, updating transactions, and deleting transactions (including full installment group deletion).

## Glossary

- **Transaction_API**: The REST API Gateway resource (`/transactions`) that handles HTTP requests for transaction operations
- **Create_Handler**: The Lambda function responsible for creating new transaction entries in DynamoDB
- **List_Handler**: The Lambda function responsible for querying and returning transaction entries from DynamoDB
- **Get_Handler**: The Lambda function responsible for retrieving a single transaction entry by its sort key
- **Update_Handler**: The Lambda function responsible for modifying an existing transaction entry in DynamoDB
- **Delete_Handler**: The Lambda function responsible for removing transaction entries from DynamoDB
- **Transaction_Form**: The frontend page/component used to create or edit a transaction
- **Transaction_List_Page**: The frontend page that displays all transactions for the authenticated user
- **Ledger_Table**: The DynamoDB table (`laskifin-Ledger`) storing all transaction records
- **Installment_Group**: A set of transaction entries sharing the same `groupId`, representing a purchase split across multiple months
- **User_Partition**: The DynamoDB partition key pattern `USER#<cognitoSub>` that isolates each user's data

## Requirements

### Requirement 1: Create Transaction

**User Story:** As a user, I want to create a new transaction (income or expense), so that I can record my financial activity in the ledger.

#### Acceptance Criteria

1. WHEN the user submits a valid transaction payload via POST `/transactions`, THE Create_Handler SHALL create one or more entries in the Ledger_Table and return HTTP 201 with a success message.
2. THE Create_Handler SHALL validate that the payload contains: `description` (non-empty string), `totalAmount` (positive number), `date` (valid ISO date string), `type` ("INC" or "EXP"), `source` (non-empty string), and `category` (non-empty string).
3. WHEN `installments` is greater than 1, THE Create_Handler SHALL create N separate entries in the Ledger_Table, each with `amount` equal to `totalAmount / N`, a shared `groupId`, sequential `installmentNumber` (1 to N), `installmentTotal` equal to N, and `totalAmount` equal to the original purchase amount.
4. WHEN `installments` is greater than 1, THE Create_Handler SHALL set each installment's `date` to the corresponding month offset from the original date and suffix the `description` with `(i/N)` format.
5. WHEN `installments` is omitted or equal to 1, THE Create_Handler SHALL create a single entry with `amount` equal to `totalAmount`, `installmentNumber` set to 1, `installmentTotal` set to 1, and `groupId` assigned.
6. THE Create_Handler SHALL set the partition key to `USER#<cognitoSub>` extracted from the Cognito authorizer claims.
7. THE Create_Handler SHALL set the sort key to `TRANS#<YYYY-MM>#<type>#<uuid>` using the transaction date's year-month, the transaction type, and a unique identifier.
8. IF the request body is missing or contains invalid JSON, THEN THE Create_Handler SHALL return HTTP 400 with a descriptive error message.
9. IF Zod validation fails, THEN THE Create_Handler SHALL return HTTP 400 with the list of validation error messages.
10. IF the Cognito sub claim is missing from the request context, THEN THE Create_Handler SHALL return HTTP 401 with an "Unauthorized" error.

### Requirement 2: List Transactions

**User Story:** As a user, I want to see a list of all my transactions, so that I can review my financial activity.

#### Acceptance Criteria

1. WHEN the user sends a GET request to `/transactions`, THE List_Handler SHALL return HTTP 200 with all transaction entries for the authenticated user from the Ledger_Table.
2. THE List_Handler SHALL query the Ledger_Table using partition key `USER#<cognitoSub>` and sort key prefix `TRANS#`.
3. WHERE the query parameter `month` is provided (format YYYY-MM), THE List_Handler SHALL filter results to only transactions matching that year-month in the sort key.
4. WHERE the query parameter `type` is provided ("INC" or "EXP"), THE List_Handler SHALL filter results to only transactions matching that type.
5. THE List_Handler SHALL return transactions sorted by date in descending order (most recent first).
6. IF the Cognito sub claim is missing from the request context, THEN THE List_Handler SHALL return HTTP 401 with an "Unauthorized" error.
7. WHEN no transactions exist for the given filters, THE List_Handler SHALL return HTTP 200 with an empty array.

### Requirement 3: Get Transaction Detail

**User Story:** As a user, I want to view the full details of a single transaction, so that I can inspect its attributes.

#### Acceptance Criteria

1. WHEN the user sends a GET request to `/transactions/{sk}`, THE Get_Handler SHALL return HTTP 200 with the full transaction item from the Ledger_Table.
2. THE Get_Handler SHALL retrieve the item using partition key `USER#<cognitoSub>` and the provided sort key `sk` path parameter.
3. IF no item exists for the given partition key and sort key, THEN THE Get_Handler SHALL return HTTP 404 with a "Transaction not found" error.
4. IF the Cognito sub claim is missing from the request context, THEN THE Get_Handler SHALL return HTTP 401 with an "Unauthorized" error.

### Requirement 4: Update Transaction

**User Story:** As a user, I want to update an existing transaction, so that I can correct mistakes or adjust details.

#### Acceptance Criteria

1. WHEN the user sends a PUT request to `/transactions/{sk}` with a valid payload, THE Update_Handler SHALL update the specified transaction in the Ledger_Table and return HTTP 200 with the updated item.
2. THE Update_Handler SHALL allow updating the following fields: `description`, `amount`, `date`, `type`, `source`, and `category`.
3. THE Update_Handler SHALL validate the update payload using Zod, applying the same field rules as creation (non-empty strings, positive amount, valid date, valid type).
4. THE Update_Handler SHALL use a DynamoDB conditional expression to verify the item exists before updating; IF the item does not exist, THEN THE Update_Handler SHALL return HTTP 404 with a "Transaction not found" error.
5. IF the Cognito sub claim is missing from the request context, THEN THE Update_Handler SHALL return HTTP 401 with an "Unauthorized" error.
6. IF Zod validation fails, THEN THE Update_Handler SHALL return HTTP 400 with the list of validation error messages.
7. WHEN the transaction belongs to an Installment_Group (installmentTotal > 1), THE Update_Handler SHALL update only the individual installment entry, not the entire group.

### Requirement 5: Delete Transaction

**User Story:** As a user, I want to delete a transaction, so that I can remove incorrect or unwanted entries from my ledger.

#### Acceptance Criteria

1. WHEN the user sends a DELETE request to `/transactions/{sk}`, THE Delete_Handler SHALL remove the specified transaction from the Ledger_Table and return HTTP 200 with a success message.
2. THE Delete_Handler SHALL delete the item using partition key `USER#<cognitoSub>` and the provided sort key `sk` path parameter.
3. IF no item exists for the given partition key and sort key, THEN THE Delete_Handler SHALL return HTTP 404 with a "Transaction not found" error.
4. IF the Cognito sub claim is missing from the request context, THEN THE Delete_Handler SHALL return HTTP 401 with an "Unauthorized" error.

5. WHERE the query parameter `deleteGroup=true` is provided and the transaction belongs to an Installment_Group, THE Delete_Handler SHALL delete all entries sharing the same `groupId` for the authenticated user and return HTTP 200 with the count of deleted entries.

### Requirement 6: Transaction List Page

**User Story:** As a user, I want a page that shows all my transactions in a table, so that I can browse and manage my financial records.

#### Acceptance Criteria

1. THE Transaction_List_Page SHALL display a table with columns: date, description, type (INC/EXP), category, source, amount, and installment info (if applicable).
2. THE Transaction_List_Page SHALL fetch transactions from GET `/transactions` on page load using the authenticated user's token.
3. THE Transaction_List_Page SHALL provide a month filter (YYYY-MM) that re-fetches transactions for the selected month.
4. THE Transaction_List_Page SHALL provide a type filter (All, INC, EXP) that re-fetches transactions for the selected type.
5. THE Transaction_List_Page SHALL display a loading indicator while transactions are being fetched.
6. WHEN the transaction list is empty, THE Transaction_List_Page SHALL display a message indicating no transactions were found.
7. THE Transaction_List_Page SHALL provide a "New Transaction" button that navigates to the Transaction_Form for creation.
8. THE Transaction_List_Page SHALL provide edit and delete action buttons for each transaction row.
9. WHEN the user clicks the delete button, THE Transaction_List_Page SHALL display a confirmation dialog before sending the DELETE request.
10. THE Transaction_List_Page SHALL format amounts as currency (BRL) and dates in a human-readable format.

### Requirement 7: Transaction Create/Edit Form Page

**User Story:** As a user, I want a form page to create or edit transactions, so that I can input or modify my financial data conveniently.

#### Acceptance Criteria

1. THE Transaction_Form SHALL include fields for: description (text input), totalAmount (number input), date (date picker), type (select: INC or EXP), source (text input), category (text input), and installments (number input, default 1).
2. THE Transaction_Form SHALL validate all fields on the client side before submission, showing inline error messages for invalid fields.
3. WHEN used for creation, THE Transaction_Form SHALL send a POST request to `/transactions` with the form data and navigate back to the Transaction_List_Page on success.
4. WHEN used for editing, THE Transaction_Form SHALL pre-populate fields with the existing transaction data fetched from GET `/transactions/{sk}`.
5. WHEN used for editing, THE Transaction_Form SHALL send a PUT request to `/transactions/{sk}` with the updated data and navigate back to the Transaction_List_Page on success.
6. WHEN used for editing, THE Transaction_Form SHALL hide the installments field since individual installment entries are updated independently.
7. THE Transaction_Form SHALL display a loading state on the submit button while the API request is in progress.
8. IF the API returns an error, THEN THE Transaction_Form SHALL display the error message to the user without navigating away.

### Requirement 8: API Gateway and CDK Infrastructure

**User Story:** As a developer, I want all transaction CRUD endpoints wired through API Gateway with Cognito authorization and Lambda integrations, so that the backend is secure and properly deployed.

#### Acceptance Criteria

1. THE Transaction_API SHALL expose the following routes: POST `/transactions`, GET `/transactions`, GET `/transactions/{sk}`, PUT `/transactions/{sk}`, DELETE `/transactions/{sk}`.
2. THE Transaction_API SHALL require Cognito User Pool authorization on all transaction routes.
3. THE Transaction_API SHALL use separate Lambda functions for each operation (create, list, get, update, delete), each defined as a `NodejsFunction` with esbuild bundling.
4. THE Transaction_API SHALL grant least-privilege DynamoDB permissions: read-only for list and get handlers, write-only for create handler, read-write for update and delete handlers.
5. THE Transaction_API SHALL pass the `TABLE_NAME` environment variable to all Lambda functions referencing the Ledger_Table.
6. THE Transaction_API SHALL configure CORS to allow the frontend origin for all transaction routes.
