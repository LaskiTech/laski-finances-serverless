---
inclusion: auto
---

# LASKI Finances — Frontend Standards

## Stack

- **Framework**: React 19 + TypeScript, built with Vite
- **UI Library**: Chakra UI v3 — prop-based API, pre-styled components; use for all forms, tables, and dashboard widgets
- **Auth**: AWS Amplify JS v6 (modular imports) — email/password + Google federated sign-in via Cognito Hosted UI
- **Hosting**: AWS Amplify Hosting — deployed manually via `scripts/deploy-front.sh` (no Git repo connected)
- **Custom Domain**: `appfin.kioshitechmuta.link`

## Project Structure

```
front/src/
├── auth/            # Amplify config, AuthProvider, useAuth hook, auth-service
├── api/             # API client modules per domain (transactions, income, balance, etc.)
├── components/      # Shared UI components (BalanceWidget, InsightsWidget, etc.)
├── pages/           # Page components (DashboardPage, TransactionsPage, etc.)
└── routes.tsx       # React Router route definitions
```

## Key Rules

- Always use modular Amplify v6 imports — never the legacy monolithic import
- API base URL comes from the `VITE_API_URL` environment variable — never hardcode
- Every API call must attach the Cognito ID token in the `Authorization` header
- All UI text is in Portuguese (the app UI language); code, field names, and comments remain in English

## Testing (Frontend)

Framework: **Vitest** + **React Testing Library**.

- Property-based tests use `fast-check`, minimum **100 iterations**
- Tag property tests: `// Feature: <name>, Property <N>: <description>`

Test file locations:
```
front/src/
├── __tests__/               # Page-level component tests
└── components/__tests__/    # Widget and component tests
```
