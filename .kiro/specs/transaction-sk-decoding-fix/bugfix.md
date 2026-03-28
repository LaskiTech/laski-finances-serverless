# Bugfix Requirements Document

## Introduction

When a user attempts to get, update, or delete a transaction via the API, the request returns a 404 "Transaction not found" error. The root cause is that the `sk` (sort key) path parameter contains `#` characters which the frontend correctly URL-encodes as `%23`. However, API Gateway REST API (v1) does not fully decode `%23` back to `#` in path parameters before passing them to the Lambda handler. The three affected Lambda handlers (`get-transaction.ts`, `update-transaction.ts`, `delete-transaction.ts`) use the raw `sk` value from `event.pathParameters` without calling `decodeURIComponent()`, causing DynamoDB lookups to fail because the encoded key does not match the stored key.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the frontend sends a GET request to `/transactions/{sk}` where `sk` contains URL-encoded `#` characters (e.g., `TRANS%232026-03%23EXP%2380deaa1c-9311-4202-8a50-0bb56c2cfffb`) THEN the system returns 404 "Transaction not found" because `get-transaction.ts` uses the still-encoded `sk` value for the DynamoDB `GetCommand` key lookup

1.2 WHEN the frontend sends a PUT request to `/transactions/{sk}` where `sk` contains URL-encoded `#` characters THEN the system returns 404 "Transaction not found" because `update-transaction.ts` uses the still-encoded `sk` value for the DynamoDB `UpdateCommand` key lookup, triggering a `ConditionalCheckFailedException`

1.3 WHEN the frontend sends a DELETE request to `/transactions/{sk}` where `sk` contains URL-encoded `#` characters THEN the system returns 404 "Transaction not found" because `delete-transaction.ts` uses the still-encoded `sk` value for the DynamoDB `DeleteCommand`/`GetCommand` key lookup

### Expected Behavior (Correct)

2.1 WHEN the frontend sends a GET request to `/transactions/{sk}` where `sk` contains URL-encoded `#` characters THEN the system SHALL decode the `sk` path parameter using `decodeURIComponent()` and return the matching transaction from DynamoDB

2.2 WHEN the frontend sends a PUT request to `/transactions/{sk}` where `sk` contains URL-encoded `#` characters THEN the system SHALL decode the `sk` path parameter using `decodeURIComponent()` and successfully update the matching transaction in DynamoDB

2.3 WHEN the frontend sends a DELETE request to `/transactions/{sk}` where `sk` contains URL-encoded `#` characters THEN the system SHALL decode the `sk` path parameter using `decodeURIComponent()` and successfully delete the matching transaction (or group) from DynamoDB

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `sk` path parameter does not contain any URL-encoded characters THEN the system SHALL CONTINUE TO process get, update, and delete operations correctly (since `decodeURIComponent()` on an already-decoded string is a no-op for values without percent-encoded sequences)

3.2 WHEN the `sk` path parameter is missing or empty THEN the system SHALL CONTINUE TO return 400 "Missing transaction key"

3.3 WHEN the DynamoDB item does not exist for the given decoded `sk` THEN the system SHALL CONTINUE TO return 404 "Transaction not found"

3.4 WHEN the user is not authenticated THEN the system SHALL CONTINUE TO return 401 "Unauthorized"

3.5 WHEN the frontend sends a POST request to `/transactions` to create a new transaction THEN the system SHALL CONTINUE TO create the transaction without any change (create-transaction does not use `sk` path parameter)

3.6 WHEN the frontend sends a GET request to `/transactions` to list transactions THEN the system SHALL CONTINUE TO return the list without any change (list-transactions does not use `sk` path parameter)
