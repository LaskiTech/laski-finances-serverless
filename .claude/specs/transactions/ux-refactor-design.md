# Design Document

## Introduction

This document describes the frontend design and implementation approach for the UX refactor of the transactions and income navigation, as specified in `ux-refactor-requirements.md`. No backend changes are required.

## Component Architecture

### Before (current state)

```
AppLayout (Nav: Dashboard | Transactions | Income)
├── /dashboard          → DashboardPage
├── /transactions       → TransactionsPage          (All INC+EXP, "New Transaction" → generic form)
├── /transactions/new   → TransactionFormPage       (type selector, installments)
├── /transactions/edit/:sk → TransactionFormPage
├── /income             → IncomePage                (INC only, "New Income" → income form)
├── /income/new         → IncomeFormPage            (recurring-aware)
└── /income/edit/:sk    → IncomeFormPage
```

### After (target state)

```
AppLayout (Nav: Dashboard | Transactions)
├── /dashboard                        → DashboardPage (unchanged)
├── /transactions                     → TransactionsPage (tab controller)
│   ├── ?tab=all     (default)  → AllTab component
│   ├── ?tab=income             → IncomeTab component
│   └── ?tab=expenses           → ExpensesTab component
├── /transactions/income/new          → IncomeFormPage
├── /transactions/income/edit/:sk     → IncomeFormPage
├── /transactions/expense/new         → ExpenseFormPage  (new)
└── /transactions/expense/edit/:sk    → ExpenseFormPage  (new)
```

## File Changes

### Files to delete
- `front/src/pages/IncomePage.tsx` — superseded by the `IncomeTab` sub-component
- `front/src/pages/TransactionFormPage.tsx` — superseded by `ExpenseFormPage`

### Files to create
- `front/src/pages/ExpenseFormPage.tsx` — expense-specific form
- `front/src/components/transactions/AllTab.tsx` — All tab content
- `front/src/components/transactions/IncomeTab.tsx` — Income tab content
- `front/src/components/transactions/ExpensesTab.tsx` — Expenses tab content

### Files to modify
- `front/src/router/routes.tsx` — remove old routes, add new routes
- `front/src/components/AppLayout.tsx` — remove "Income" nav link
- `front/src/pages/TransactionsPage.tsx` — replace table with tab controller
- `front/src/pages/IncomeFormPage.tsx` — update cancel/success navigation targets

## Detailed Component Design

### TransactionsPage (tab controller)

`TransactionsPage` becomes a thin shell that renders the three-tab UI. It reads `?tab=` from `useSearchParams()` to determine the active tab, defaulting to `"all"`.

```tsx
// Pseudocode
const [searchParams, setSearchParams] = useSearchParams();
const activeTab = searchParams.get('tab') ?? 'all';

const handleTabChange = (tab: 'all' | 'income' | 'expenses') => {
  setSearchParams({ tab });
};
```

The month filter state lives in `TransactionsPage` and is passed down to each tab so switching tabs preserves the selected month.

**Tab header strip** (Chakra `Tabs` or custom buttons):
- Three buttons: All | Income | Expenses
- Active tab: bottom border in `#00D4AA`, font weight 600
- Inactive tab: gray, hover darkens

**"New" button** per tab (top right of page):
- All tab → `NewTransactionMenu` (see below)
- Income tab → single button "New Income" → `/transactions/income/new`
- Expenses tab → single button "New Expense" → `/transactions/expense/new`

### NewTransactionMenu (for All tab)

A simple split-button or popover shown when clicking "New Transaction" on the All tab. Two options appear:

```
┌─────────────────────┐
│  + New Transaction ▾│
└─────────────────────┘
         ↓ (click)
┌───────────────────────┐
│  Income               │  → navigate('/transactions/income/new')
│  Expense              │  → navigate('/transactions/expense/new')
└───────────────────────┘
```

Implementation: Chakra `Menu.Root` / `Menu.Content` pattern (already available in the project via Chakra UI v3).

### AllTab

Columns: **Date | Description | Type | Category | Source | Amount | Installment | Actions**

- Type badge: `INC` → green badge (`#F0FDF4` / `#16A34A`), `EXP` → red badge (`#FEF2F2` / `#DC2626`)
- Amount: colored by type (green for INC, dark for EXP, or neutral — TBD by implementation)
- Edit button: routes based on `tx.type`:
  - `INC` → `/transactions/income/edit/${encodeURIComponent(tx.sk)}`
  - `EXP` → `/transactions/expense/edit/${encodeURIComponent(tx.sk)}`
- Delete: same behavior as current `TransactionsPage` (confirm dialog, group delete prompt for installments)
- Data source: `listTransactions(month, undefined)` from existing `front/src/api/transactions.ts`

### IncomeTab

Columns: **Date | Description | Category | Source | Amount | Recurring | Actions**

- Recurring column: blue "Recurring" badge when `isRecurring === true`, `—` otherwise
- No Installment column
- Edit button: always → `/transactions/income/edit/${encodeURIComponent(item.sk)}`
- Delete: confirm dialog; if `item.isRecurring`, additional prompt "Delete this and all future entries?"
- Data source: `listIncome(month)` from existing `front/src/api/income.ts`

### ExpensesTab

Columns: **Date | Description | Category | Source | Amount | Installment | Actions**

- Installment column: `${installmentNumber}/${installmentTotal}` or `—`
- No Recurring column
- Edit button: always → `/transactions/expense/edit/${encodeURIComponent(tx.sk)}`
- Delete: confirm dialog; if `installmentTotal > 1`, additional prompt "Delete all installments?"
- Data source: `listTransactions(month, 'EXP')` from existing `front/src/api/transactions.ts`

### IncomeFormPage (updated)

Existing file at `front/src/pages/IncomeFormPage.tsx`. Changes:

1. Route mounts at `/transactions/income/new` and `/transactions/income/edit/:sk` (not `/income/*`)
2. Cancel button navigates to `/transactions?tab=income`
3. On successful submit, navigates to `/transactions?tab=income`
4. Everything else (fields, recurring logic, API calls) remains unchanged

### ExpenseFormPage (new)

New file at `front/src/pages/ExpenseFormPage.tsx`. Derived from the current `TransactionFormPage` with these differences:

1. No type selector — always submits `type: "EXP"`
2. Has installments field (create mode only), with helper text: "Amount will be split into N monthly payments of R$ X.XX"
3. The helper text updates reactively as `totalAmount` or `installments` changes
4. Cancel and success navigation go to `/transactions?tab=expenses`
5. In edit mode: no installments field (per existing behavior), pre-populates from GET `/transactions/:sk`
6. Calls `createTransaction({ ..., type: 'EXP' })` / `updateTransaction(sk, { ... })`

### AppLayout (updated)

Remove "Income" from `NAV_LINKS`:

```ts
// Before
const NAV_LINKS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Transactions", path: "/transactions" },
  { label: "Income", path: "/income" },
];

// After
const NAV_LINKS = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Transactions", path: "/transactions" },
];
```

Active state detection: the Transactions link should be active when `location.pathname.startsWith('/transactions')`.

### Routes (updated)

```tsx
// Remove
<Route path="/transactions/new" element={<TransactionFormPage />} />
<Route path="/transactions/edit/:sk" element={<TransactionFormPage />} />
<Route path="/income" element={<IncomePage />} />
<Route path="/income/new" element={<IncomeFormPage />} />
<Route path="/income/edit/:sk" element={<IncomeFormPage />} />

// Add
<Route path="/transactions/income/new" element={<IncomeFormPage />} />
<Route path="/transactions/income/edit/:sk" element={<IncomeFormPage />} />
<Route path="/transactions/expense/new" element={<ExpenseFormPage />} />
<Route path="/transactions/expense/edit/:sk" element={<ExpenseFormPage />} />
```

## Tab State and URL Design

The active tab is stored as `?tab=all|income|expenses` in the URL. This allows:
- Bookmarking / sharing a tab-specific view
- The browser back button to return to the previous tab
- Edit forms to navigate back to the correct tab using `navigate('/transactions?tab=income')` etc.

The month filter is stored in component state only (not in the URL), consistent with the current implementation.

## Implementation Order

1. **Create `ExpenseFormPage`** — copy `TransactionFormPage`, remove type selector, fix navigation targets.
2. **Update `IncomeFormPage`** — only change the navigation targets (`/income` → `/transactions?tab=income`).
3. **Build tab sub-components** — `AllTab`, `IncomeTab`, `ExpensesTab` as standalone files.
4. **Refactor `TransactionsPage`** — replace table body with tab controller + sub-components.
5. **Update routes** — remove old routes, add new routes.
6. **Update `AppLayout`** — remove Income nav link, update active-state check.
7. **Delete** `IncomePage.tsx` and `TransactionFormPage.tsx`.

## No Backend Changes

All API calls use the existing `front/src/api/transactions.ts` and `front/src/api/income.ts` clients without modification. The existing endpoints, Lambda handlers, CDK stacks, and DynamoDB tables are untouched.
