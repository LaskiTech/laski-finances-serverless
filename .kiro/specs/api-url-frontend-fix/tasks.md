# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Amplify Branches Missing VITE_API_URL
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete case: synthesize `FrontendStack` with an `apiUrl` prop and assert both `CfnBranch` resources include `VITE_API_URL` in their `EnvironmentVariables`
  - Add a new `describe('Bug Condition: Amplify branches receive VITE_API_URL', ...)` block in `infra/test/stacks.test.ts`
  - Instantiate `FrontendStack` passing `apiUrl: 'https://test-api.execute-api.us-west-2.amazonaws.com/prod/'` in props
  - Assert that the synthesized template has `AWS::Amplify::Branch` resources with `EnvironmentVariables` containing `{ Name: 'VITE_API_URL', Value: 'https://test-api.execute-api.us-west-2.amazonaws.com/prod/' }`
  - Assert both `MainBranch` (stage PRODUCTION) and `DevBranch` (stage DEVELOPMENT) have the environment variable
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS because `FrontendStackProps` does not accept `apiUrl` yet (TypeScript compilation error or missing env vars in template)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.3, 1.4, 2.3, 2.4_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing FrontendStack Infrastructure Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Add a new `describe('Preservation: existing FrontendStack resources unchanged', ...)` block in `infra/test/stacks.test.ts`
  - Observe on UNFIXED code: `CfnApp` buildSpec contains `npm ci`, `npm run build`, `dist` artifacts, `front` appRoot
  - Observe on UNFIXED code: `CfnDomain` has `kioshitechmuta.link` with subDomainSettings mapping `main` → `appfin` and `dev` → `devfin`
  - Observe on UNFIXED code: Two `AWS::Amplify::Branch` resources exist (main PRODUCTION, dev DEVELOPMENT)
  - Observe on UNFIXED code: `CfnApp` name is `laskifin-frontend`
  - Observe on UNFIXED code: Resource counts — 1 `AWS::Amplify::App`, 2 `AWS::Amplify::Branch`, 1 `AWS::Amplify::Domain`
  - Write property-based tests asserting all observed values are preserved:
    - Test buildSpec preservation: assert `AWS::Amplify::App` BuildSpec contains the exact Vite build phases and `front` appRoot
    - Test domain mapping preservation: assert `AWS::Amplify::Domain` subDomainSettings has `appfin`/`main` and `devfin`/`dev`
    - Test resource count preservation: assert exactly 1 App, 2 Branches, 1 Domain
    - Test app naming preservation: assert App name is `laskifin-frontend`
    - Test branch config preservation: assert `main` branch has `PRODUCTION` stage and `dev` branch has `DEVELOPMENT` stage
  - Also verify `front/.env` preservation: assert `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID` entries exist (manual check or snapshot)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 3. Fix for missing VITE_API_URL in Amplify branch environment variables

  - [x] 3.1 Add `apiUrl` prop to `FrontendStackProps` and set environment variables on CfnBranch constructs
    - In `infra/lib/frontend-stack.ts`: add `apiUrl: string` to the `FrontendStackProps` interface
    - On the `MainBranch` `CfnBranch` construct: add `environmentVariables` property with `[{ name: 'VITE_API_URL', value: props.apiUrl }]`
    - On the `DevBranch` `CfnBranch` construct: add `environmentVariables` property with `[{ name: 'VITE_API_URL', value: props.apiUrl }]`
    - _Bug_Condition: isBugCondition(input) where "apiUrl" NOT IN frontendStackProps AND branches lack VITE_API_URL_
    - _Expected_Behavior: Both CfnBranch resources include VITE_API_URL set to the API Gateway URL_
    - _Preservation: BuildSpec, domain mappings, branch stages, app name, resource naming must remain unchanged_
    - _Requirements: 1.3, 2.3_

  - [x] 3.2 Pass `apiUrl` to `FrontendStack` in `infra/bin/infra.ts` and remove explicit dependency
    - In `infra/bin/infra.ts`: add `apiUrl: apiStack.restApi.url` to the `FrontendStack` instantiation props
    - Remove the `frontendStack.addDependency(apiStack)` line — the cross-stack reference via `apiStack.restApi.url` creates an implicit dependency
    - Update the existing `FrontendStack` test in `infra/test/stacks.test.ts` to pass `apiUrl` in props (so tests compile)
    - _Bug_Condition: isBugCondition(input) where apiStack.restApi.url is not forwarded to FrontendStack_
    - _Expected_Behavior: FrontendStack receives apiUrl from apiStack.restApi.url, creating implicit cross-stack dependency_
    - _Preservation: All other stack instantiations and tags in infra.ts must remain unchanged_
    - _Requirements: 1.4, 2.4_

  - [x] 3.3 Add `VITE_API_URL` to `front/.env` for local development
    - Add `VITE_API_URL=http://localhost:3000` to `front/.env`
    - Ensure existing `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID` entries are not modified
    - _Preservation: Existing Cognito env vars must remain unchanged_
    - _Requirements: 1.1, 2.1, 3.1_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Amplify Branches Receive VITE_API_URL
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing FrontendStack Infrastructure Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite with `npx jest --run` from the `infra/` directory
  - Ensure all tests pass, ask the user if questions arise.
