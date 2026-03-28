# Transaction SK Decoding Fix — Bugfix Design

## Overview

The `sk` (sort key) path parameter for transactions follows the format `TRANS#YYYY-MM#TYPE#UUID`, which contains `#` characters. The frontend correctly URL-encodes these as `%23` when building request URLs. However, API Gateway REST API (v1) passes the `%23`-encoded value to Lambda handlers without fully decoding it. The three affected handlers (`get-transaction.ts`, `update-transaction.ts`, `delete-transaction.ts`) use the raw `event.pathParameters.sk` value directly in DynamoDB key lookups, causing every GET, PUT, and DELETE by `sk` to return 404.

The fix adds a shared `decodeSk()` utility in `utils.ts` that applies `decodeURIComponent()` to the `sk` path parameter, and updates all three handlers to use it. This is a minimal, targeted change — `decodeURIComponent()` is a no-op for strings without percent-encoded sequences, so non-encoded `sk` values are unaffected.

## Glossary

- **Bug_Condition (C)**: The `sk` path parameter contains URL-encoded characters (specifically `%23` for `#`) that are not decoded before DynamoDB lookup
- **Property (P)**: After decoding, the `sk` value matches the stored DynamoDB sort key and the operation succeeds
- **Preservation**: All existing behavior for requests where `sk` has no encoded characters, missing `sk`, unauthenticated users, non-existent items, and unrelated endpoints (create, list) must remain unchanged
- **sk (sort key)**: The DynamoDB sort key for transactions, format: `TRANS#YYYY-MM#TYPE#UUID` (e.g., `TRANS#2026-03#EXP#80deaa1c-9311-4202-8a50-0bb56c2cfffb`)
- **decodeSk()**: The proposed shared utility function in `utils.ts` that wraps `decodeURIComponent()` for the `sk` path parameter
- **API Gateway REST API v1**: AWS service that routes HTTP requests to Lambda; does not fully decode `%23` in path parameters

## Bug Details

### Bug Condition

The bug manifests when a client sends a GET, PUT, or DELETE request to `/transactions/{sk}` where the `sk` value contains `#` characters that were URL-encoded as `%23` by the client. API Gateway REST API v1 passes the still-encoded value (e.g., `TRANS%232026-03%23EXP%2380deaa1c-...`) to the Lambda handler via `event.pathParameters.sk`. The handler uses this encoded value directly as the DynamoDB sort key, which does not match the stored key (`TRANS#2026-03#EXP#80deaa1c-...`), resulting in a 404 response.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { method: string, sk: string | undefined }
  OUTPUT: boolean

  RETURN input.method IN ['GET', 'PUT', 'DELETE']
         AND input.sk IS NOT undefined
         AND input.sk CONTAINS '%23'
         AND decodeURIComponent(input.sk) != input.sk
END FUNCTION
```

### Examples

- **GET** `/transactions/TRANS%232026-03%23EXP%2380deaa1c-9311-4202-8a50-0bb56c2cfffb` → handler receives `sk = "TRANS%232026-03%23EXP%2380deaa1c-..."`, DynamoDB lookup fails → **404** (expected: 200 with transaction data)
- **PUT** `/transactions/TRANS%232026-03%23EXP%2380deaa1c-...` with valid body → handler uses encoded `sk` in `UpdateCommand` key → `ConditionalCheckFailedException` → **404** (expected: 200 with updated item)
- **DELETE** `/transactions/TRANS%232026-03%23EXP%2380deaa1c-...` → handler uses encoded `sk` in `GetCommand`/`DeleteCommand` key → **404** (expected: 200 with deletion confirmation)
- **Edge case**: `sk` with no `#` characters (hypothetical) → `decodeURIComponent()` is a no-op → behavior unchanged

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Requests where `sk` contains no percent-encoded characters must continue to work identically (decodeURIComponent is a no-op)
- Missing or empty `sk` must continue to return 400 "Missing transaction key"
- Non-existent items (after decoding) must continue to return 404 "Transaction not found"
- Unauthenticated requests must continue to return 401 "Unauthorized"
- POST `/transactions` (create) must remain completely unaffected — it does not use `sk` path parameter
- GET `/transactions` (list) must remain completely unaffected — it does not use `sk` path parameter
- Request body validation in `update-transaction.ts` must remain unchanged
- Group delete logic in `delete-transaction.ts` must remain unchanged (only the `sk` extraction is affected)

**Scope:**
All inputs that do NOT involve a URL-encoded `sk` path parameter should be completely unaffected by this fix. This includes:
- Requests with already-decoded `sk` values
- Requests to `/transactions` (no `sk` parameter)
- Any request where authentication or validation fails before `sk` is used

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is clear and singular:

1. **Missing `decodeURIComponent()` call**: All three handlers (`get-transaction.ts`, `update-transaction.ts`, `delete-transaction.ts`) read `event.pathParameters?.sk` and pass it directly to DynamoDB commands without decoding. The `sk` format `TRANS#YYYY-MM#TYPE#UUID` always contains `#` characters, which the frontend correctly encodes as `%23`. API Gateway REST API v1 does not decode `%23` back to `#` in path parameters before passing them to Lambda.

2. **No shared decoding utility**: The `utils.ts` file provides `extractUserId`, `errorResponse`, `successResponse`, and `parseJsonBody`, but has no utility for decoding path parameters. Each handler independently reads `event.pathParameters?.sk` with no decoding step.

3. **API Gateway v1 behavior**: Unlike API Gateway v2 (HTTP API), REST API v1 does not automatically decode all percent-encoded characters in path parameters. The `#` character is particularly affected because it has special meaning in URLs (fragment identifier), so `%23` is preserved in the path parameter value.

## Correctness Properties

Property 1: Bug Condition — Encoded SK values are decoded before DynamoDB lookup

_For any_ request to GET, PUT, or DELETE `/transactions/{sk}` where the `sk` path parameter contains URL-encoded characters (`%23`), the fixed handler SHALL decode the `sk` using `decodeURIComponent()` before using it in DynamoDB operations, so that the decoded value matches the stored sort key and the operation succeeds.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Non-encoded SK values and other behaviors unchanged

_For any_ request where the `sk` path parameter does NOT contain URL-encoded characters, or where the request fails before `sk` is used (auth failure, missing `sk`, non-existent item), the fixed handlers SHALL produce exactly the same result as the original handlers, preserving all existing error handling, validation, and response behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `back/lambdas/src/transactions/utils.ts`

**New Function**: `decodeSk`

**Specific Changes**:
1. **Add `decodeSk()` utility**: Add a shared function that takes the raw `sk` string from `event.pathParameters` and returns `decodeURIComponent(sk)`. This centralizes the decoding logic so all handlers use the same approach.

**File**: `back/lambdas/src/transactions/get-transaction.ts`

**Function**: `handler`

**Specific Changes**:
2. **Import `decodeSk`**: Add `decodeSk` to the import from `./utils`
3. **Decode `sk` after extraction**: After `const sk = event.pathParameters?.sk` and the null check, apply `decodeSk(sk)` before passing it to the `GetCommand`

**File**: `back/lambdas/src/transactions/update-transaction.ts`

**Function**: `handler`

**Specific Changes**:
4. **Import `decodeSk`**: Add `decodeSk` to the import from `./utils`
5. **Decode `sk` after extraction**: After `const sk = event.pathParameters?.sk` and the null check, apply `decodeSk(sk)` before passing it to the `UpdateCommand`

**File**: `back/lambdas/src/transactions/delete-transaction.ts`

**Function**: `handler`

**Specific Changes**:
6. **Import `decodeSk`**: Add `decodeSk` to the import from `./utils`
7. **Decode `sk` after extraction**: After `const sk = event.pathParameters?.sk` and the null check, apply `decodeSk(sk)` before passing it to `deleteGroup()` or `deleteSingle()`

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm that the root cause is the missing `decodeURIComponent()` call.

**Test Plan**: Write unit tests that invoke each handler with a mock `APIGatewayProxyEvent` containing an encoded `sk` path parameter (e.g., `TRANS%232026-03%23EXP%2380deaa1c-...`). Mock DynamoDB to return an item only when the decoded key is used. Run these tests on the UNFIXED code to observe 404 failures.

**Test Cases**:
1. **GET with encoded sk**: Call `get-transaction` handler with `sk = "TRANS%232026-03%23EXP%2380deaa1c-..."` — DynamoDB mock expects decoded key → handler returns 404 (will fail on unfixed code)
2. **PUT with encoded sk**: Call `update-transaction` handler with encoded `sk` and valid body — DynamoDB mock expects decoded key → handler returns 404 (will fail on unfixed code)
3. **DELETE single with encoded sk**: Call `delete-transaction` handler with encoded `sk` — DynamoDB mock expects decoded key → handler returns 404 (will fail on unfixed code)
4. **DELETE group with encoded sk**: Call `delete-transaction` handler with encoded `sk` and `deleteGroup=true` — DynamoDB mock expects decoded key → handler returns 404 (will fail on unfixed code)

**Expected Counterexamples**:
- All four test cases return 404 because the handler passes `TRANS%232026-03%23EXP%23...` to DynamoDB instead of `TRANS#2026-03#EXP#...`
- Root cause confirmed: no `decodeURIComponent()` call on `event.pathParameters.sk`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handler_fixed(input)
  ASSERT result.statusCode != 404 OR itemDoesNotExistInDB(decodeSk(input.sk))
  ASSERT DynamoDB was queried with decodeSk(input.sk), not input.sk
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handler_original(input) = handler_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss (e.g., `sk` values with other special characters)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-encoded `sk` values, missing `sk`, unauthenticated requests, and non-existent items. Then write property-based tests capturing that behavior and verify it holds after the fix.

**Test Cases**:
1. **Auth failure preservation**: Verify that requests without valid Cognito claims continue to return 401 on both unfixed and fixed code
2. **Missing sk preservation**: Verify that requests with no `sk` path parameter continue to return 400 on both unfixed and fixed code
3. **Non-existent item preservation**: Verify that requests with a valid decoded `sk` that doesn't exist in DynamoDB continue to return 404 on both unfixed and fixed code
4. **Non-encoded sk preservation**: Verify that requests with `sk` values containing no percent-encoded characters produce identical results on unfixed and fixed code

### Unit Tests

- Test `decodeSk()` utility with encoded input (`TRANS%232026-03%23EXP%23uuid`) → returns decoded value
- Test `decodeSk()` utility with already-decoded input (`TRANS#2026-03#EXP#uuid`) → returns same value (no-op)
- Test `decodeSk()` utility with input containing no special characters → returns same value
- Test each handler (get, update, delete) with encoded `sk` → successful DynamoDB operation
- Test each handler with non-encoded `sk` → successful DynamoDB operation (preservation)
- Test each handler with missing `sk` → 400 response (preservation)
- Test each handler with unauthenticated request → 401 response (preservation)

### Property-Based Tests

- Generate random `sk` values in the format `TRANS#YYYY-MM#TYPE#UUID`, URL-encode them, and verify `decodeSk()` always recovers the original value
- Generate random `sk` values without percent-encoded characters and verify `decodeSk()` returns the input unchanged
- Generate random handler inputs where `isBugCondition` is false and verify fixed handlers produce identical results to original handlers

### Integration Tests

- Test full request flow: create a transaction, then GET/PUT/DELETE it using the `sk` from the creation response (which contains `#` characters)
- Test that the frontend `encodeURIComponent(sk)` → API Gateway → Lambda → `decodeSk()` → DynamoDB pipeline works end-to-end
- Test group delete with encoded `sk` to verify the decoded value propagates correctly through `deleteGroup()`
