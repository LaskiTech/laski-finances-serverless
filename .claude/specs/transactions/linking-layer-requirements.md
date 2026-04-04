# Requirements Document — Expense Association (Linking Layer)

## Introduction

The Expense Association feature allows users to declare that one Ledger entry is financially related to one or more other Ledger entries. The primary use case is statement import reconciliation: a bank account debit described as "Bill Payment" represents the settlement of a credit card bill, and that debit should be linkable to the individual credit card line items imported from the card statement.

Links are a separate data entity stored in a dedicated table (`laskifin-Links`). They do not modify existing Ledger entries. Links are purely declarative — they carry no financial weight of their own and do not affect balance calculations. Their sole purpose is to let the user and the system understand that two or more transactions are financially connected.

This feature is a Phase 2 blocker: the statement import pipeline (Phase 3) must produce linkable transactions from day one, which requires the link data model and API to exist before import is implemented.

All coding standards in `coding-standards.md` apply without exception.

## Glossary

- **Link**: A directed association from one Ledger entry (the parent) to one or more other Ledger entries (the children). Stored as an item in `laskifin-Links`.
- **Parent_Entry**: The Ledger entry that initiated or encompasses the linked entries. In the bill payment use case, this is the bank account debit ("Bill Payment — R$ 1,000").
- **Child_Entry**: A Ledger entry that is referenced by a Link. In the bill payment use case, these are the individual credit card line items (Food, Transport, Leisure).
- **Link_ID**: A UUID uniquely identifying a single Link item. Returned to the client on creation.
- **Links_Table**: The DynamoDB table `laskifin-Links` storing all link associations.
- **Create_Link_Handler**: The Lambda function `create-link.ts` responsible for creating a Link.
- **List_Links_Handler**: The Lambda function `list-links.ts` responsible for returning all links for a given Ledger entry.
- **Delete_Link_Handler**: The Lambda function `delete-link.ts` responsible for removing a Link.
- **Link_Widget**: The frontend UI component that displays and manages links for a given transaction.
- **Ledger_Table**: The DynamoDB table `laskifin-Ledger`. The linking layer reads from it for validation but never writes to it.

## Business Rules

- **BR-L1**: Both the Parent_Entry and all Child_Entries must belong to the same authenticated user. Cross-user links are never permitted.
- **BR-L2**: A Parent_Entry and its Child_Entries may have any combination of types (INC or EXP). The link model does not enforce type relationships — the user decides what is conceptually related.
- **BR-L3**: A Ledger entry may appear as a parent in multiple links and as a child in multiple links simultaneously (many-to-many).
- **BR-L4**: A Ledger entry may not be linked to itself.
- **BR-L5**: Duplicate links between the same parent and child are not permitted. Attempting to create a link that already exists returns HTTP 409.
- **BR-L6**: Deleting a Ledger entry does not automatically delete its links. The application does not cascade deletes. Stale links (where the parent or child no longer exists in the Ledger) are silently ignored when reading.
- **BR-L7**: Links carry no financial weight. They do not affect `laskifin-MonthlySummary` or any balance calculation.
- **BR-L8**: A single Link item connects exactly one parent to exactly one child. Linking one parent to N children requires creating N separate Link items.

## Requirements

### Requirement 1: Create Link

**User Story:** As a user, I want to declare that one transaction is financially related to another, so that I can track how a bank payment corresponds to individual credit card charges.

#### Acceptance Criteria

1. WHEN the user sends `POST /links` with a valid payload, THE Create_Link_Handler SHALL create a Link item in `laskifin-Links` and return HTTP 201 with the `linkId`.
2. THE request body SHALL contain: `parentSk` (non-empty string — the sort key of the Parent_Entry in the Ledger) and `childSk` (non-empty string — the sort key of the Child_Entry in the Ledger).
3. THE Create_Link_Handler SHALL verify that both `parentSk` and `childSk` resolve to existing items in `laskifin-Ledger` for the authenticated user. IF either item does not exist, THE handler SHALL return HTTP 404 with a message identifying which entry was not found.
4. IF `parentSk` equals `childSk`, THE Create_Link_Handler SHALL return HTTP 400 with the message "A transaction cannot be linked to itself."
5. IF a Link item already exists between the same `parentSk` and `childSk` for the authenticated user, THE Create_Link_Handler SHALL return HTTP 409 with the message "This link already exists."
6. THE Create_Link_Handler SHALL set `createdAt` to the current ISO 8601 timestamp and assign a new UUID as the `linkId`.
7. THE Create_Link_Handler SHALL set the partition key to `USER#<cognitoSub>` and enforce user isolation — both Ledger lookups and the Links write use the same `pk`.
8. IF the Cognito sub claim is missing, THE Create_Link_Handler SHALL return HTTP 401.
9. IF the request body is missing or invalid JSON, THE Create_Link_Handler SHALL return HTTP 400.

### Requirement 2: List Links for a Transaction

**User Story:** As a user, I want to see all transactions linked to a given entry, so that I can understand its full financial context — both what it points to and what points to it.

#### Acceptance Criteria

1. WHEN the user sends `GET /links?sk=<ledger-sort-key>`, THE List_Links_Handler SHALL return all Link items where the given `sk` appears as either `parentSk` or `childSk` for the authenticated user.
2. THE response SHALL include two arrays: `asParent` (links where the entry is the Parent_Entry, each enriched with the resolved Child_Entry details) and `asChild` (links where the entry is a Child_Entry, each enriched with the resolved Parent_Entry details).
3. FOR each link in both arrays, THE List_Links_Handler SHALL resolve the counterpart Ledger entry and include its `description`, `amount`, `type`, `date`, `category`, and `source` in the response. Stale links whose counterpart no longer exists in the Ledger SHALL be omitted from the response silently — not returned as errors.
4. THE `sk` query parameter is required. IF it is absent, THE List_Links_Handler SHALL return HTTP 400.
5. IF no links exist for the given `sk`, THE List_Links_Handler SHALL return HTTP 200 with empty `asParent` and `asChild` arrays.
6. IF the Cognito sub claim is missing, THE List_Links_Handler SHALL return HTTP 401.

### Requirement 3: Delete Link

**User Story:** As a user, I want to remove a link I created by mistake, so that I can correct incorrect associations.

#### Acceptance Criteria

1. WHEN the user sends `DELETE /links/{linkId}`, THE Delete_Link_Handler SHALL remove the Link item from `laskifin-Links` and return HTTP 200.
2. THE Delete_Link_Handler SHALL verify that the Link item belongs to the authenticated user before deleting. IF the link exists but belongs to a different user, the handler SHALL return HTTP 404 (not 403) to avoid disclosing the existence of other users' data.
3. IF no Link item exists with the given `linkId` for the authenticated user, THE Delete_Link_Handler SHALL return HTTP 404.
4. IF the Cognito sub claim is missing, THE Delete_Link_Handler SHALL return HTTP 401.
5. Deleting a Link SHALL NOT affect the Ledger entries it referenced. Neither `parentSk` nor `childSk` entries are modified.

### Requirement 4: Link Widget UI

**User Story:** As a user, I want to see and manage links from within the transaction detail view, so that I can associate and dis-associate related transactions without leaving the context of the entry I am viewing.

#### Acceptance Criteria

1. THE Link_Widget SHALL be displayed within the transaction detail view (accessible from the Transaction_List_Page's edit action).
2. ON load, THE Link_Widget SHALL fetch `GET /links?sk=<current-entry-sk>` and display the results in two sections: "This entry pays for" (asParent) and "Paid by" (asChild).
3. WHEN either section is non-empty, THE Link_Widget SHALL display each linked entry as a row showing: description, amount (BRL formatted), type badge, date, and a remove button.
4. THE Link_Widget SHALL provide an "Add link" button that opens a search interface allowing the user to find a Ledger entry by description text or by browsing a month filter.
5. WHEN the user selects an entry from the search interface, THE Link_Widget SHALL call `POST /links` with the current entry's `sk` as `parentSk` and the selected entry's `sk` as `childSk`.
6. WHEN the user clicks the remove button on a linked entry row, THE Link_Widget SHALL display a confirmation prompt before calling `DELETE /links/{linkId}`.
7. THE Link_Widget SHALL display a loading state while fetches are in progress and inline errors if any operation fails, without navigating away.
8. THE Link_Widget SHALL not allow the user to link a transaction to itself — the current entry SHALL be excluded from search results.

### Requirement 5: API Gateway and CDK Infrastructure

**User Story:** As a developer, I want the links endpoints wired through API Gateway with Cognito authorisation and least-privilege permissions on the new Links table, so that the feature is secure and deployable.

#### Acceptance Criteria

1. THE Links API SHALL expose: `POST /links`, `GET /links`, and `DELETE /links/{linkId}`.
2. All three routes SHALL require Cognito User Pool authorisation.
3. Each handler SHALL be a `NodejsFunction` with Node.js 22.x runtime, 256 MB memory, 10 s timeout, esbuild minify + sourceMap.
4. THE Create_Link_Handler SHALL be granted `grantReadData` on `laskifin-Ledger` (for existence checks) and `grantWriteData` on `laskifin-Links`.
5. THE List_Links_Handler SHALL be granted `grantReadData` on `laskifin-Links` and `grantReadData` on `laskifin-Ledger` (for enrichment).
6. THE Delete_Link_Handler SHALL be granted `grantReadWriteData` on `laskifin-Links` only — it does not access the Ledger.
7. All handlers SHALL receive `LINKS_TABLE_NAME` as an environment variable. The Create_Link_Handler and List_Links_Handler SHALL also receive `TABLE_NAME` (Ledger).
8. All three routes SHALL be configured with CORS to allow the frontend origin.
