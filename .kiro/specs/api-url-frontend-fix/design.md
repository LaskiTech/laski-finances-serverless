# API URL Frontend Fix — Bugfix Design

## Overview

The frontend application cannot reach the backend API because `VITE_API_URL` is never injected into the runtime environment. The variable `import.meta.env.VITE_API_URL` evaluates to `undefined`, causing every API call to target `undefined/transactions/...` which returns 404 from CloudFront/S3. The fix requires threading the API Gateway URL from `ApiStack` through `FrontendStack` props and into the Amplify branch environment variables, plus adding a local `.env` entry for development.

## Glossary

- **Bug_Condition (C)**: The condition where `VITE_API_URL` is absent from both the Amplify branch environment variables and the local `.env` file, causing `import.meta.env.VITE_API_URL` to resolve to `undefined`
- **Property (P)**: The desired behavior where `VITE_API_URL` is set to the API Gateway invoke URL (e.g., `https://<id>.execute-api.<region>.amazonaws.com/prod/`), enabling the frontend to reach the backend
- **Preservation**: Existing Cognito environment variables, Vite build configuration, custom domain mappings, API Gateway resources, and resource naming conventions must remain unchanged
- **FrontendStack**: The CDK stack in `infra/lib/frontend-stack.ts` that provisions the Amplify app, branches, and custom domain
- **FrontendStackProps**: The props interface for `FrontendStack`, currently missing an `apiUrl` property
- **ApiStack.restApi.url**: The API Gateway invoke URL exposed publicly by `ApiStack` in `infra/lib/api-stack.ts`
- **CfnBranch.environmentVariables**: The L1 Amplify construct property that injects environment variables into the Amplify build and runtime

## Bug Details

### Bug Condition

The bug manifests when the frontend attempts any API call. The `FrontendStackProps` interface does not include an `apiUrl` property, so `infra/bin/infra.ts` never passes `apiStack.restApi.url` to `FrontendStack`. Consequently, the Amplify branches are created without `VITE_API_URL` in their environment variables, and the local `.env` file also lacks this entry.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { frontendStackProps: FrontendStackProps, envFile: Record<string, string> }
  OUTPUT: boolean

  RETURN "apiUrl" NOT IN frontendStackProps
         AND "VITE_API_URL" NOT IN envFile
         AND frontendApp.branches[*].environmentVariables NOT CONTAINS "VITE_API_URL"
END FUNCTION
```

### Examples

- **Deployed (dev)**: Frontend at `devfin.kioshitechmuta.link` calls `fetch(undefined + "/transactions")` → request goes to `https://devfin.kioshitechmuta.link/undefined/transactions` → 404 from CloudFront/S3
- **Deployed (prod)**: Frontend at `appfin.kioshitechmuta.link` calls `fetch(undefined + "/transactions/TXN#123")` → same 404 pattern
- **Local dev**: Developer runs `npm run dev` in `front/` → `import.meta.env.VITE_API_URL` is `undefined` → all API calls fail with network errors or 404s
- **Edge case**: If a developer manually sets `VITE_API_URL` in `.env` but the Amplify branch lacks it, local dev works but deployed builds still fail

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID` must remain in `.env` and continue to be used by the auth module
- The Amplify `buildSpec` (npm ci → npm run build → dist artifacts from `front/` appRoot) must not change
- Custom domain mapping (`main` → `appfin.kioshitechmuta.link`, `dev` → `devfin.kioshitechmuta.link`) must remain intact
- `ApiStack` resources (REST API, Lambda functions, Cognito authorizer, CORS settings, `/transactions` and `/transactions/{sk}` routes) must not change
- Resource names must continue using the `laskifin` prefix without stage suffixes

**Scope:**
All infrastructure and code that does NOT involve `VITE_API_URL` propagation should be completely unaffected by this fix. This includes:
- Auth stack (Cognito User Pool, Client)
- Data stack (DynamoDB tables)
- API stack (API Gateway, Lambdas)
- Frontend API module (`front/src/api/transactions.ts`) — no code changes needed here
- Vite build configuration (`front/vite.config.ts`)

## Hypothesized Root Cause

Based on the bug description and code analysis, the root cause is a missing data flow:

1. **Missing Prop in FrontendStackProps**: The `FrontendStackProps` interface in `infra/lib/frontend-stack.ts` does not declare an `apiUrl` property, so there is no way to pass the API Gateway URL into the stack

2. **Missing Prop Wiring in infra.ts**: `infra/bin/infra.ts` instantiates `FrontendStack` without passing `apiStack.restApi.url`, even though `ApiStack` already exposes `restApi` as a public property

3. **Missing Amplify Environment Variables**: The `CfnBranch` constructs for `main` and `dev` do not set `environmentVariables`, so `VITE_API_URL` is never available during Amplify builds

4. **Missing Local .env Entry**: `front/.env` contains Cognito variables but not `VITE_API_URL`, so local development also fails

## Correctness Properties

Property 1: Bug Condition — Amplify Branches Receive API URL

_For any_ deployment where `FrontendStack` receives an `apiUrl` prop, the synthesized CloudFormation template SHALL include `VITE_API_URL` in the `environmentVariables` of every `CfnBranch` resource, with the value set to the API Gateway invoke URL.

**Validates: Requirements 2.1, 2.3, 2.4**

Property 2: Preservation — Existing Infrastructure Unchanged

_For any_ synthesized CloudFormation output after the fix, the `CfnApp` buildSpec, `CfnDomain` subDomainSettings, and all `ApiStack` resources SHALL be identical to the pre-fix output, preserving all existing Amplify build configuration, custom domain mappings, and API Gateway resources.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `infra/lib/frontend-stack.ts`

**Interface**: `FrontendStackProps`

**Specific Changes**:
1. **Add `apiUrl` prop**: Add `apiUrl: string` to the `FrontendStackProps` interface so the stack can receive the API Gateway URL

2. **Set environment variables on CfnBranch (main)**: Add `environmentVariables` to the `MainBranch` `CfnBranch` construct with `VITE_API_URL` set to `props.apiUrl`

3. **Set environment variables on CfnBranch (dev)**: Add `environmentVariables` to the `DevBranch` `CfnBranch` construct with `VITE_API_URL` set to `props.apiUrl`

---

**File**: `infra/bin/infra.ts`

**Specific Changes**:
4. **Pass apiUrl to FrontendStack**: Add `apiUrl: apiStack.restApi.url` to the `FrontendStack` instantiation props. This creates a real cross-stack reference (CDK will generate `Fn::ImportValue` automatically), replacing the explicit `addDependency` call which becomes unnecessary

5. **Remove explicit addDependency**: The line `frontendStack.addDependency(apiStack)` can be removed since the cross-stack reference via `apiStack.restApi.url` creates an implicit dependency

---

**File**: `front/.env`

**Specific Changes**:
6. **Add VITE_API_URL for local development**: Add `VITE_API_URL=http://localhost:3000` (or the actual dev API Gateway URL) so local development works. The actual deployed URL will be injected by Amplify at build time

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Synthesize the CDK stacks with the current (unfixed) code and inspect the CloudFormation template for `FrontendStack`. Verify that `CfnBranch` resources lack `environmentVariables` with `VITE_API_URL`. Also verify that `FrontendStackProps` does not accept `apiUrl`.

**Test Cases**:
1. **CDK Synth Inspection**: Synthesize stacks and check that `CfnBranch` resources have no `VITE_API_URL` in environment variables (will confirm bug on unfixed code)
2. **Props Interface Check**: Verify `FrontendStackProps` does not include `apiUrl` (will confirm bug on unfixed code)
3. **infra.ts Wiring Check**: Verify `FrontendStack` instantiation does not pass API URL (will confirm bug on unfixed code)
4. **Local .env Check**: Verify `front/.env` does not contain `VITE_API_URL` (will confirm bug on unfixed code)

**Expected Counterexamples**:
- `CfnBranch` CloudFormation resources have no `EnvironmentVariables` property
- `FrontendStackProps` interface lacks `apiUrl` field
- Possible causes: oversight during initial stack creation, API URL was intended to be added later

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL stack WHERE isBugCondition(stack) DO
  result := synthFrontendStack_fixed(stack)
  ASSERT result.CfnBranch["MainBranch"].environmentVariables CONTAINS { name: "VITE_API_URL", value: apiGatewayUrl }
  ASSERT result.CfnBranch["DevBranch"].environmentVariables CONTAINS { name: "VITE_API_URL", value: apiGatewayUrl }
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL resource WHERE NOT isBugCondition(resource) DO
  ASSERT synthStack_original(resource) = synthStack_fixed(resource)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It can generate various CDK stack configurations and verify that non-VITE_API_URL resources remain unchanged
- It catches edge cases like accidental modification of buildSpec or domain settings
- It provides strong guarantees that only the intended changes were made

**Test Plan**: Synthesize the CDK stacks before and after the fix. Compare all CloudFormation resources except the `CfnBranch` `environmentVariables` to verify they are identical.

**Test Cases**:
1. **BuildSpec Preservation**: Verify the `CfnApp` buildSpec is identical before and after the fix
2. **Domain Mapping Preservation**: Verify `CfnDomain` subDomainSettings are unchanged (main → appfin, dev → devfin)
3. **Cognito Env Vars Preservation**: Verify existing `VITE_COGNITO_*` variables in `.env` are not removed or modified
4. **ApiStack Preservation**: Verify ApiStack CloudFormation output is identical before and after the fix
5. **Resource Naming Preservation**: Verify no stage suffixes are introduced in resource names

### Unit Tests

- Test that `FrontendStackProps` accepts `apiUrl` as a required string prop
- Test that synthesized `CfnBranch` resources include `VITE_API_URL` in environment variables
- Test that the `VITE_API_URL` value matches the API Gateway URL token/reference
- Test that `front/.env` contains `VITE_API_URL` entry

### Property-Based Tests

- Generate random API Gateway URL strings and verify they are correctly propagated to both CfnBranch environment variables
- Generate stack configurations with varying props and verify only `environmentVariables` changes between fixed and unfixed versions
- Test that for any valid `apiUrl` input, the synthesized template always includes the correct environment variable on all branches

### Integration Tests

- Deploy the fixed stacks to a dev environment and verify `VITE_API_URL` is set on Amplify branches
- Trigger an Amplify build and verify the frontend can reach the API Gateway endpoint
- Verify that existing functionality (auth, domain routing) continues to work after deployment
