# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** — Encoded SK Returns 404 on Unfixed Handlers
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists across all three handlers
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — `sk` values containing `%23` (URL-encoded `#`) sent to GET, PUT, and DELETE handlers
  - Create test file `back/lambdas/test/transactions/sk-decoding-bug-condition.test.ts`
  - Mock DynamoDB `GetCommand`, `UpdateCommand`, `DeleteCommand`, and `BatchWriteCommand` to return items only when the key uses the decoded `sk` (e.g., `TRANS#2026-03#EXP#<uuid>`)
  - Mock `APIGatewayProxyEvent` with `pathParameters.sk` set to an encoded value (e.g., `TRANS%232026-03%23EXP%2380deaa1c-9311-4202-8a50-0bb56c2cfffb`)
  - Test cases from Bug Condition (`isBugCondition`): for any `sk` where `sk CONTAINS '%23' AND decodeURIComponent(sk) != sk`:
    - GET handler with encoded `sk` → assert `statusCode === 200` (will get 404 on unfixed code)
    - PUT handler with encoded `sk` and valid body → assert `statusCode === 200` (will get 404 on unfixed code)
    - DELETE single handler with encoded `sk` → assert `statusCode === 200` (will get 404 on unfixed code)
    - DELETE group handler with encoded `sk` and `deleteGroup=true` → assert `statusCode === 200` (will get 404 on unfixed code)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: All assertions FAIL with 404 instead of 200 — this proves the bug exists
  - Document counterexamples: handlers pass `TRANS%232026-03%23EXP%23...` to DynamoDB instead of `TRANS#2026-03#EXP#...`
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Non-Encoded SK and Error Handling Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology — run UNFIXED code first, observe outputs, then write tests asserting those outputs
  - Observe on UNFIXED code:
    - GET/PUT/DELETE with non-encoded `sk` (e.g., `TRANS#2026-03#EXP#uuid`) and item exists in DynamoDB → returns 200
    - GET/PUT/DELETE with missing `sk` (`pathParameters.sk` is undefined) → returns 400 "Missing transaction key"
    - GET/PUT/DELETE with unauthenticated request (no Cognito claims) → returns 401 "Unauthorized"
    - GET/PUT/DELETE with non-existent decoded `sk` → returns 404 "Transaction not found"
    - PUT with invalid request body → returns 400 "Validation failed"
  - Create test file `back/lambdas/test/transactions/sk-decoding-preservation.test.ts`
  - Write property-based tests using fast-check capturing observed behavior for all inputs where `isBugCondition` is false:
    - For all non-encoded `sk` values (no `%23`), handlers produce the same response as observed on unfixed code
    - For all requests with missing `sk`, handlers return 400 with "Missing transaction key"
    - For all unauthenticated requests, handlers return 401 with "Unauthorized"
    - For all non-existent items (after decoding), handlers return 404 with "Transaction not found"
    - For PUT with invalid body, handler returns 400 with validation errors
    - Group delete logic in `delete-transaction.ts` remains unchanged
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS — this confirms baseline behavior to preserve
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix: Add `decodeSk()` utility and update handlers to decode `sk` path parameter

  - [x] 3.1 Add `decodeSk()` utility to `back/lambdas/src/transactions/utils.ts`
    - Add exported function `decodeSk(sk: string): string` that returns `decodeURIComponent(sk)`
    - This centralizes the decoding logic for all handlers
    - _Bug_Condition: isBugCondition(input) where input.sk CONTAINS '%23' AND decodeURIComponent(input.sk) != input.sk_
    - _Expected_Behavior: decodeSk(sk) returns the decoded value matching the stored DynamoDB sort key_
    - _Preservation: decodeURIComponent is a no-op for strings without percent-encoded sequences_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Update `get-transaction.ts` to use `decodeSk()`
    - Import `decodeSk` from `./utils`
    - After `const sk = event.pathParameters?.sk` and the null check, apply `const decodedSk = decodeSk(sk)`
    - Pass `decodedSk` to the `GetCommand` key instead of raw `sk`
    - _Bug_Condition: GET handler receives encoded sk, DynamoDB lookup fails_
    - _Expected_Behavior: GET handler decodes sk, DynamoDB lookup succeeds_
    - _Preservation: Non-encoded sk values pass through unchanged_
    - _Requirements: 2.1, 3.1_

  - [x] 3.3 Update `update-transaction.ts` to use `decodeSk()`
    - Import `decodeSk` from `./utils`
    - After `const sk = event.pathParameters?.sk` and the null check, apply `const decodedSk = decodeSk(sk)`
    - Pass `decodedSk` to the `UpdateCommand` key instead of raw `sk`
    - _Bug_Condition: PUT handler receives encoded sk, DynamoDB update fails with ConditionalCheckFailedException_
    - _Expected_Behavior: PUT handler decodes sk, DynamoDB update succeeds_
    - _Preservation: Non-encoded sk values, body validation, error handling unchanged_
    - _Requirements: 2.2, 3.1_

  - [x] 3.4 Update `delete-transaction.ts` to use `decodeSk()`
    - Import `decodeSk` from `./utils`
    - After `const sk = event.pathParameters?.sk` and the null check, apply `const decodedSk = decodeSk(sk)`
    - Pass `decodedSk` to `deleteGroup()` and `deleteSingle()` instead of raw `sk`
    - _Bug_Condition: DELETE handler receives encoded sk, DynamoDB delete/get fails_
    - _Expected_Behavior: DELETE handler decodes sk, DynamoDB operations succeed_
    - _Preservation: Group delete logic, non-encoded sk values, error handling unchanged_
    - _Requirements: 2.3, 3.1_

  - [x] 3.5 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — Encoded SK Returns 200 on Fixed Handlers
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (assert 200 for encoded `sk`)
    - When this test passes, it confirms the expected behavior is satisfied: `decodeSk()` decodes the `sk` before DynamoDB operations
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES — confirms bug is fixed for all three handlers
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.6 Verify preservation tests still pass
    - **Property 2: Preservation** — Non-Encoded SK and Error Handling Behavior Still Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS — confirms no regressions in auth checks, missing sk handling, non-existent items, body validation, and non-encoded sk behavior
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite to confirm both bug condition and preservation tests pass
  - Ensure no other existing tests are broken by the changes
  - Ask the user if questions arise
