# Bugfix Requirements Document

## Introduction

The frontend application cannot communicate with the backend API. All API calls include `undefined` in the URL path (e.g., `https://devfin.kioshitechmuta.link/undefined/transactions/`), resulting in 404 errors from CloudFront/S3 because the requests never reach API Gateway. The root cause is that the `VITE_API_URL` environment variable is never defined — neither in the local `.env` file nor in the Amplify branch configuration — because the CDK `FrontendStack` does not receive or propagate the API Gateway URL from `ApiStack`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the frontend constructs an API URL using `import.meta.env.VITE_API_URL` THEN the system resolves the variable to `undefined` because no `VITE_API_URL` entry exists in `front/.env` or in the Amplify environment variables

1.2 WHEN the frontend makes any API call (list, get, create, update, delete transactions) THEN the system sends requests to `undefined/transactions/...`, which returns a 404 from CloudFront/S3 and never reaches API Gateway

1.3 WHEN the `FrontendStack` is deployed via CDK THEN the system does not set `VITE_API_URL` as an Amplify environment variable because `FrontendStack` does not accept or receive the API URL from `ApiStack`

1.4 WHEN `infra/bin/infra.ts` instantiates `FrontendStack` THEN the system does not pass the API Gateway URL because the `FrontendStackProps` interface lacks an `apiUrl` property and `apiStack.restApi.url` is not forwarded

### Expected Behavior (Correct)

2.1 WHEN the frontend constructs an API URL using `import.meta.env.VITE_API_URL` THEN the system SHALL resolve the variable to the API Gateway invoke URL (e.g., `https://<id>.execute-api.us-west-2.amazonaws.com/prod`)

2.2 WHEN the frontend makes any API call (list, get, create, update, delete transactions) THEN the system SHALL send requests to the correct API Gateway endpoint and receive valid responses

2.3 WHEN the `FrontendStack` is deployed via CDK THEN the system SHALL set `VITE_API_URL` as an environment variable on each Amplify branch, using the API Gateway URL received from `ApiStack`

2.4 WHEN `infra/bin/infra.ts` instantiates `FrontendStack` THEN the system SHALL pass the API Gateway URL from `apiStack.restApi.url` to `FrontendStack` via its props

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the frontend authenticates users via Cognito THEN the system SHALL CONTINUE TO use the existing `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_USER_POOL_CLIENT_ID` environment variables without modification

3.2 WHEN the Amplify app builds the frontend THEN the system SHALL CONTINUE TO use the existing Vite build configuration (`npm ci`, `npm run build`, `dist` artifacts from `front/` appRoot)

3.3 WHEN the Amplify custom domain maps branches to subdomains THEN the system SHALL CONTINUE TO map `main` to `appfin.kioshitechmuta.link` and `dev` to `devfin.kioshitechmuta.link`

3.4 WHEN the `ApiStack` deploys the REST API THEN the system SHALL CONTINUE TO expose the same `/transactions` and `/transactions/{sk}` resources with Cognito authorization, CORS settings, and Lambda integrations

3.5 WHEN CDK resource names are generated THEN the system SHALL CONTINUE TO use the `laskifin` prefix without stage suffixes, following the existing naming convention
