# Implementation Plan: Transaction CRUD

## Overview

Implement full CRUD for financial transactions across three layers: backend Lambda handlers (list, get, update, delete — create already exists), frontend pages (list + form), and CDK infrastructure wiring. Each task builds incrementally, starting with shared backend utilities, then handlers, then infrastructure, then frontend API client, and finally the UI pages.

## Tasks

- [x] 1. Create shared backend validation schemas and utility helpers
  - [x] 1.1 Create `back/lambdas/src/transactions/schemas.ts` with Zod schemas
    - Extract `CreateTransactionSchema` from `create-transaction.ts` into the shared module
    - Add `UpdateTransactionSchema` (description, amount, date, type, source, category — all required, no installments field)
    - Add `ListQuerySchema` for validating optional `month` (YYYY-MM) and `type` (INC/EXP) query params
    - Export all schemas and inferred types
    - _Requirements: 1.2, 2.3, 2.4, 4.3_

  - [x] 1.2 Create `back/lambdas/src/transactions/utils.ts` with shared handler helpers
    - `extractUserId(event)`: extracts Cognito sub from `event.requestContext.authorizer?.claims?.sub`, returns `string | null`
    - `errorResponse(statusCode, message, details?)`: builds a standard `APIGatewayProxyResult` error response
    - `successResponse(statusCode, body)`: builds a standard success response
    - `parseJsonBody(body)`: safely parses JSON body, returns parsed object or null
    - _Requirements: 1.6, 1.8, 1.10_

  - [x] 1.3 Refactor `create-transaction.ts` to use shared schemas and utils
    - Import `CreateTransactionSchema` from `schemas.ts`
    - Import `extractUserId`, `errorResponse`, `successResponse`, `parseJsonBody` from `utils.ts`
    - Remove duplicated schema and inline helpers
    - Ensure handler behavior is unchanged
    - _Requirements: 1.1 through 1.10_

- [x] 2. Implement list-transactions handler
  - [x] 2.1 Create `back/lambdas/src/transactions/list-transactions.ts`
    - Query `Ledger_Table` with `pk = USER#<sub>` and `sk begins_with TRANS#` using `QueryCommand`
    - Build sort key prefix dynamically based on `month` and `type` query params
    - Set `ScanIndexForward: false` for descending sort by sk
    - Return `{ transactions: [...] }` with HTTP 200, or empty array if no results
    - Return 401 if Cognito sub is missing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 2.2 Write property test: list filter correctness
    - **Property 5: List filter correctness**
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 2.3 Write property test: list returns all matching transactions
    - **Property 6: List returns all matching transactions**
    - **Validates: Requirements 2.1**

  - [ ]* 2.4 Write property test: list ordering
    - **Property 7: List ordering**
    - **Validates: Requirements 2.5**

- [x] 3. Implement get-transaction handler
  - [x] 3.1 Create `back/lambdas/src/transactions/get-transaction.ts`
    - Use `GetCommand` with `pk = USER#<sub>` and `sk` from path parameter
    - Return full item with HTTP 200, or 404 if not found
    - Return 401 if Cognito sub is missing
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Write property test: create-then-get round trip
    - **Property 8: Create-then-get round trip**
    - **Validates: Requirements 3.1**

- [x] 4. Implement update-transaction handler
  - [x] 4.1 Create `back/lambdas/src/transactions/update-transaction.ts`
    - Validate payload with `UpdateTransactionSchema` from `schemas.ts`
    - Use `UpdateCommand` with `ConditionExpression: "attribute_exists(pk)"` to verify item exists
    - Update fields: description, amount, date, type, source, category
    - Catch `ConditionalCheckFailedException` and return 404
    - Return updated item with HTTP 200
    - Return 401 if Cognito sub is missing, 400 if validation fails
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 4.2 Write property test: update reflects new values
    - **Property 9: Update reflects new values**
    - **Validates: Requirements 4.1**

  - [ ]* 4.3 Write property test: update validation rejects invalid payloads
    - **Property 10: Update validation rejects invalid payloads**
    - **Validates: Requirements 4.3, 4.6**

  - [ ]* 4.4 Write property test: update isolation for installment groups
    - **Property 11: Update isolation for installment groups**
    - **Validates: Requirements 4.7**

- [x] 5. Implement delete-transaction handler
  - [x] 5.1 Create `back/lambdas/src/transactions/delete-transaction.ts`
    - Single delete: `DeleteCommand` with `ConditionExpression: "attribute_exists(pk)"`, catch `ConditionalCheckFailedException` for 404
    - Group delete (`deleteGroup=true` query param): `GetCommand` to retrieve `groupId`, `QueryCommand` with `FilterExpression` on `groupId` to find siblings, `BatchWriteCommand` to delete all (handle 25-item batch limit)
    - Return 200 with success message (include count for group delete)
    - Return 401 if Cognito sub is missing, 404 if item not found
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.2 Write property test: delete removes item
    - **Property 12: Delete removes item**
    - **Validates: Requirements 5.1**

  - [ ]* 5.3 Write property test: group delete removes all siblings
    - **Property 13: Group delete removes all siblings**
    - **Validates: Requirements 5.5**

- [x] 6. Checkpoint — Backend handlers complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update CDK ApiStack with new Lambda functions and routes
  - [x] 7.1 Add four new Lambda functions to `infra/lib/api-stack.ts`
    - `listTransactionsHandler`: NodejsFunction pointing to `list-transactions.ts`, `grantReadData`
    - `getTransactionHandler`: NodejsFunction pointing to `get-transaction.ts`, `grantReadData`
    - `updateTransactionHandler`: NodejsFunction pointing to `update-transaction.ts`, `grantReadWriteData`
    - `deleteTransactionHandler`: NodejsFunction pointing to `delete-transaction.ts`, `grantReadWriteData`
    - All use same config pattern as existing `createTransactionHandler` (Node.js 22.x, 256MB, 10s timeout, esbuild minify + sourceMap, TABLE_NAME env var)
    - _Requirements: 8.3, 8.4, 8.5_

  - [x] 7.2 Add API Gateway routes and wire integrations
    - Add GET method on `/transactions` resource → `listTransactionsHandler` with Cognito authorizer
    - Add `{sk}` child resource under `/transactions`
    - Add GET, PUT, DELETE methods on `/transactions/{sk}` → respective handlers with Cognito authorizer
    - All routes use existing `cognitoAuthorizer` and CORS config
    - _Requirements: 8.1, 8.2, 8.6_

  - [ ]* 7.3 Update CDK infrastructure tests
    - Verify all 5 routes exist on the API Gateway
    - Verify Cognito authorizer is attached to all routes
    - Verify 5 separate Lambda functions are created
    - Verify IAM permissions per handler (read-only, write-only, read-write)
    - Verify TABLE_NAME environment variable is set on all Lambda functions
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 8. Checkpoint — Infrastructure complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Create frontend API client and utilities
  - [x] 9.1 Create `front/src/api/transactions.ts` — API client module
    - Define `TransactionItem`, `CreateTransactionPayload`, `UpdateTransactionPayload` TypeScript interfaces
    - Implement `listTransactions(month?, type?)`, `getTransaction(sk)`, `createTransaction(payload)`, `updateTransaction(sk, payload)`, `deleteTransaction(sk, deleteGroup?)` functions
    - All functions attach Cognito ID token from auth context as `Authorization` header
    - Use `VITE_API_URL` environment variable for API base URL
    - Handle error responses and re-throw with structured error objects
    - _Requirements: 6.2, 7.3, 7.5_

  - [x] 9.2 Create `front/src/utils/format.ts` — formatting utilities
    - `formatCurrency(amount)`: formats number as BRL using `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
    - `formatDate(isoString)`: formats ISO date string as `DD/MM/YYYY`
    - _Requirements: 6.10_

  - [ ]* 9.3 Write property test: BRL currency formatting
    - **Property 14: BRL currency formatting**
    - **Validates: Requirements 6.10**

- [x] 10. Implement Transaction List Page
  - [x] 10.1 Create `front/src/pages/TransactionsPage.tsx`
    - Fetch transactions on mount and on filter change via `listTransactions`
    - Render Chakra UI `Table` with columns: date, description, type (badge), category, source, amount, installment info
    - Month filter: `<Input type="month">` that re-fetches on change
    - Type filter: `<Select>` with All / INC / EXP options that re-fetches on change
    - Loading indicator while fetching
    - Empty state message when no transactions found
    - "New Transaction" button navigating to `/transactions/new`
    - Edit button per row navigating to `/transactions/edit/:sk`
    - Delete button per row opening confirmation dialog, then calling `deleteTransaction`
    - Format amounts as BRL and dates as DD/MM/YYYY using format utilities
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [ ]* 10.2 Write unit tests for TransactionsPage
    - Test table renders with correct columns
    - Test loading spinner displays while fetching
    - Test empty state message when no transactions
    - Test filter controls trigger re-fetch
    - Test delete confirmation dialog appears on delete click
    - _Requirements: 6.1, 6.5, 6.6, 6.9_

- [x] 11. Implement Transaction Form Page
  - [x] 11.1 Create `front/src/pages/TransactionFormPage.tsx`
    - Route: `/transactions/new` (create) or `/transactions/edit/:sk` (edit)
    - Chakra UI form with fields: description, totalAmount, date, type (select), source, category, installments (number, default 1)
    - Client-side Zod validation with inline error messages
    - Create mode: POST to `/transactions`, navigate to list on success
    - Edit mode: pre-populate from `getTransaction(sk)`, hide installments field, PUT to `/transactions/{sk}`
    - Loading state on submit button while API request is in progress
    - Display API error messages inline without navigating away
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 11.2 Write property test: client-side form validation
    - **Property 15: Client-side form validation**
    - **Validates: Requirements 7.2**

  - [ ]* 11.3 Write unit tests for TransactionFormPage
    - Test all fields render in create mode
    - Test installments field hidden in edit mode
    - Test pre-population in edit mode
    - Test API error message display
    - Test navigation on successful submit
    - _Requirements: 7.1, 7.4, 7.6, 7.8_

- [x] 12. Wire transaction pages into router and set as default post-login page
  - [x] 12.1 Add routes to `front/src/router/routes.tsx`
    - `/transactions` → `TransactionsPage` (protected)
    - `/transactions/new` → `TransactionFormPage` (protected)
    - `/transactions/edit/:sk` → `TransactionFormPage` (protected)
    - _Requirements: 6.7, 7.3, 7.5_

  - [x] 12.2 Change default post-login redirect to `/transactions`
    - Update the authenticated root route (`/`) to redirect to `/transactions` instead of the current HomePage
    - Ensure the Transaction List Page loads with an empty state (0 items) for new users
    - Update any login success redirect logic to navigate to `/transactions`

- [x] 13. Final checkpoint — All layers integrated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- The existing `create-transaction.ts` is refactored in task 1.3 to use shared modules, not rewritten
- `fast-check` is already in frontend devDependencies; add it to `back/lambdas` devDependencies when implementing backend property tests
