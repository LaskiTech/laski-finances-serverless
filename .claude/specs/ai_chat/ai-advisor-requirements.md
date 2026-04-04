# Requirements Document — AI Financial Advisor

## Introduction

The AI Financial Advisor gives users a conversational interface to a financial advisor persona powered by Claude (Anthropic API). Users ask natural language questions about their finances; the advisor responds with personalised analysis grounded in the user's actual transaction data fetched from DynamoDB at request time.

The implementation follows Option A (Lambda + Anthropic SDK): a single Lambda handler (`advisor-chat.ts`) receives the user's message and conversation history, fetches relevant financial context from `laskifin-Ledger` and `laskifin-MonthlySummary`, constructs a prompt, calls the Anthropic API, and returns the full response as a single JSON body. This is a buffered (non-streaming) integration, consistent with all other handlers in the project, and avoids the significant CDK complexity of Lambda response streaming through API Gateway REST API. Streaming can be introduced in a later iteration via Lambda Function URLs if the latency becomes unacceptable.

The advisor has no memory of its own — conversation history is maintained client-side and sent with every request. The Lambda is stateless.

All coding standards in `coding-standards.md` apply without exception.

## Glossary

- **Advisor_Handler**: The Lambda function `advisor-chat.ts` responsible for orchestrating context retrieval, prompt construction, and the Anthropic API call.
- **Conversation_History**: The ordered list of prior messages in a chat session, maintained client-side and sent in the request body on every turn. Each entry has a `role` (`"user"` or `"assistant"`) and `content` (string).
- **Financial_Context**: The structured snapshot of the user's recent financial data fetched by the Advisor_Handler before calling the Anthropic API. Includes: current month balance summary, last 3 months of transactions, and top spending categories for the current month.
- **System_Prompt**: The fixed instruction block sent to Claude on every request defining the advisor persona, its constraints, and its response format. Never exposed to the client.
- **Advisor_Widget**: The frontend React component providing the chat interface on the dashboard.
- **Turn**: One complete user-message → assistant-response cycle.
- **Anthropic_API_Key**: The secret credential required to call the Anthropic API. Stored in AWS Secrets Manager; never hardcoded, never in environment variables passed through CDK context, never logged.
- **Model**: The Claude model used for advisor responses. Specified as a fixed string constant in the handler code: `claude-sonnet-4-6` (the current Claude 4 Sonnet model). Upgrades require a dedicated task.

## Requirements

### Requirement 1: Advisor Chat Endpoint

**User Story:** As a user, I want to send a message to a financial advisor and receive a personalised response based on my actual transaction data, so that I get relevant advice rather than generic financial information.

#### Acceptance Criteria

1. WHEN the user sends `POST /advisor/chat` with a valid payload, THE Advisor_Handler SHALL return HTTP 200 with the advisor's response text.
2. THE request body SHALL contain: `message` (non-empty string, the user's current message) and `history` (array of prior conversation turns, may be empty).
3. EACH entry in `history` SHALL have `role` (`"user"` or `"assistant"`) and `content` (non-empty string). THE Advisor_Handler SHALL validate the history array with Zod and return HTTP 400 if any entry is malformed.
4. THE Advisor_Handler SHALL enforce a maximum `history` length of 20 turns (40 messages — 20 user + 20 assistant). If the provided history exceeds this limit, THE Advisor_Handler SHALL return HTTP 400 with a message instructing the user to start a new conversation.
5. THE Advisor_Handler SHALL enforce a maximum `message` length of 2000 characters. If exceeded, THE Advisor_Handler SHALL return HTTP 400.
6. THE Advisor_Handler SHALL fetch the Financial_Context for the authenticated user before calling the Anthropic API. The context fetch SHALL complete before the API call begins.
7. THE Advisor_Handler SHALL call the Anthropic API using the `@anthropic-ai/sdk` package with `model: "claude-sonnet-4-6"` and `max_tokens: 1024`.
8. THE response body SHALL contain: `response` (string — the advisor's reply text) and `contextMonth` (YYYY-MM string — the month used for Financial_Context, so the frontend can display "Based on your June 2024 data").
9. IF the Anthropic API returns an error, THE Advisor_Handler SHALL return HTTP 502 with a user-facing message: "The advisor is temporarily unavailable. Please try again in a moment."
10. IF the Anthropic API call times out (after 25 seconds, leaving 5 seconds of Lambda headroom within the 30 s timeout), THE Advisor_Handler SHALL return HTTP 504 with the message: "The advisor took too long to respond. Please try again."
11. IF the Cognito sub claim is missing, THE Advisor_Handler SHALL return HTTP 401.
12. THE Advisor_Handler SHALL log the Anthropic API response time and token usage to CloudWatch via `console.log` for cost monitoring. It SHALL NOT log the user's message content, the conversation history, or the advisor's response text.

### Requirement 2: Financial Context Retrieval

**User Story:** As a user, I want the advisor's responses to be grounded in my actual financial data, so that the advice is specific to my situation rather than generic.

#### Acceptance Criteria

1. THE Advisor_Handler SHALL fetch the following Financial_Context in parallel before constructing the prompt:
   - Current month balance summary from `laskifin-MonthlySummary` (single `GetItem`).
   - Transactions for the current month from `laskifin-Ledger` (query by `pk = USER#sub`, `sk begins_with TRANS#YYYY-MM#`), limited to the most recent 50 entries.
   - Top 5 expense categories for the current month (same query logic as `top-spending.ts`).
2. THE Advisor_Handler SHALL use `Promise.all` for the parallel fetch — a failure in any one fetch SHALL propagate as a 500 error rather than silently omitting data.
3. IF no data exists for the current month (new user or no transactions yet), THE Advisor_Handler SHALL still call the Anthropic API, providing an empty context and instructing Claude via the system prompt to acknowledge the lack of data and suggest the user start recording transactions.
4. THE Financial_Context injected into the prompt SHALL be a compact JSON summary — not raw DynamoDB items. The handler SHALL transform items into a structured object before injection.
5. THE total size of the Financial_Context injected into the prompt SHALL NOT exceed 8000 characters. If the raw context exceeds this limit, the handler SHALL truncate the transactions list (keeping the most recent entries) until the limit is satisfied. The balance summary and top categories are never truncated.

### Requirement 3: System Prompt and Persona

**User Story:** As a product owner, I want the advisor to behave as a professional, trustworthy financial advisor who gives specific and actionable responses, not generic disclaimers.

#### Acceptance Criteria

1. THE System_Prompt SHALL establish the advisor as a professional personal finance advisor named "LASKI Advisor" who speaks directly, concisely, and without unnecessary preamble.
2. THE System_Prompt SHALL instruct Claude to: ground all responses in the provided Financial_Context data, refer to specific amounts and categories from the data when relevant, and avoid giving generic advice that ignores the user's actual numbers.
3. THE System_Prompt SHALL instruct Claude to: respond in the same language as the user's message (Portuguese if the user writes in Portuguese, English otherwise), limit responses to 3–5 paragraphs unless a list or table is genuinely more helpful, and avoid excessive caveats and disclaimers.
4. THE System_Prompt SHALL instruct Claude to: never claim to have access to data it was not given, never invent transactions or amounts not present in the Financial_Context, and explicitly say "I don't have that information" when asked about data outside the context window (e.g. historical months not included in the context).
5. THE System_Prompt SHALL include a brief description of LASKI Finances' data model so Claude understands the domain vocabulary: income vs expenses, categories, sources, installments, and recurring entries.
6. THE System_Prompt SHALL be stored as a constant string in a dedicated file `back/lambdas/src/advisor/system-prompt.ts` and imported by `advisor-chat.ts`. It SHALL NOT be stored in environment variables, DynamoDB, or any external system — it is code, not configuration.
7. THE System_Prompt SHALL NOT be returned to the client in any API response.

### Requirement 4: Suggested Opening Analyses

**User Story:** As a user, I want the advisor to proactively suggest what it can analyse so I know where to start, rather than staring at an empty chat box.

#### Acceptance Criteria

1. THE Advisor_Widget SHALL display a set of suggested opening prompts when the conversation history is empty (i.e. a new session with no prior turns).
2. THE suggested prompts SHALL include at least the following options (rendered as clickable chips, not free-text):
   - "What are my biggest expenses this month?"
   - "How does my income compare to my spending?"
   - "Where can I reduce my spending?"
   - "Give me a summary of my financial health this month."
3. WHEN the user clicks a suggested prompt chip, THE Advisor_Widget SHALL send that prompt as the user's first message without requiring additional input.
4. THE suggested prompts SHALL disappear once the first message is sent and SHALL NOT reappear during the same session.
5. THE suggested prompts are defined as frontend constants — they are not fetched from the API and do not change dynamically.

### Requirement 5: Advisor Widget UI

**User Story:** As a user, I want a clean chat interface on the dashboard where I can converse with the advisor without leaving the page.

#### Acceptance Criteria

1. THE Advisor_Widget SHALL be displayed on the Dashboard_Page below the Insights_Widget.
2. THE Advisor_Widget SHALL render conversation history as a vertically scrolling list of message bubbles: user messages right-aligned, assistant messages left-aligned.
3. THE Advisor_Widget SHALL include a text input field and a send button. The send button SHALL be disabled while a request is in progress.
4. WHILE a request is in progress, THE Advisor_Widget SHALL display a typing indicator (three animated dots) in the assistant's position in the chat thread.
5. THE Advisor_Widget SHALL auto-scroll to the latest message after each turn completes.
6. IF the API returns an error (502 or 504), THE Advisor_Widget SHALL display the error message in the chat thread in the assistant's position (not as a toast or alert), with a "Try again" button that resends the last user message.
7. THE Advisor_Widget SHALL display the `contextMonth` from the response as a muted label below the assistant's message: "Based on your [Month Year] data."
8. THE Advisor_Widget SHALL allow the user to clear the conversation history with a "New conversation" button, which resets the local history state without any API call.
9. THE conversation history SHALL be stored in React component state only — it SHALL NOT be persisted to localStorage, sessionStorage, DynamoDB, or any other storage. Refreshing the page starts a new conversation.
10. THE Advisor_Widget SHALL limit the visible input to 2000 characters, matching the server-side limit, with a character counter displayed when the user has typed more than 1800 characters.

### Requirement 6: API Key Security

**User Story:** As a developer, I want the Anthropic API key to be stored and accessed securely, so that it is never exposed in logs, environment variables visible in the CDK context, or API responses.

#### Acceptance Criteria

1. THE Anthropic API key SHALL be stored in AWS Secrets Manager under the name `laski/anthropic-api-key` in both dev (us-west-2) and prod (us-west-1) regions.
2. THE Advisor_Handler SHALL retrieve the API key from Secrets Manager at cold-start time (outside the handler function, in module-level initialisation) and cache it for the lifetime of the Lambda execution environment. It SHALL NOT call Secrets Manager on every request.
3. THE CDK `ApiStack` SHALL grant the Advisor_Handler `secretsmanager:GetSecretValue` permission scoped to the `laski/anthropic-api-key` secret ARN only.
4. THE API key SHALL NOT appear in: CloudWatch logs, Lambda environment variables, CDK outputs, API responses, or any other observable surface.
5. IF Secrets Manager retrieval fails at cold start, the Lambda SHALL fail to initialise and return HTTP 500 for all requests until redeployed. It SHALL log the failure reason (not the key value) to CloudWatch.

### Requirement 7: API Gateway and CDK Infrastructure

**User Story:** As a developer, I want the advisor endpoint wired through API Gateway with Cognito authorisation and correct IAM permissions, so that it is secure and deployable alongside the other features.

#### Acceptance Criteria

1. THE Advisor_Handler SHALL be exposed as `POST /advisor/chat` on the existing API Gateway.
2. THE route SHALL require Cognito User Pool authorisation.
3. THE Advisor_Handler SHALL be a `NodejsFunction` with Node.js 22.x runtime, 512 MB memory (higher than other handlers due to the Anthropic SDK and context processing), and 30 s timeout.
4. THE Advisor_Handler SHALL be granted: `grantReadData` on `laskifin-Ledger`, `grantReadData` on `laskifin-MonthlySummary`, and `secretsmanager:GetSecretValue` on the `laski/anthropic-api-key` secret.
5. THE Advisor_Handler SHALL receive `TABLE_NAME`, `SUMMARY_TABLE_NAME`, and `ANTHROPIC_SECRET_NAME` as environment variables. The actual API key SHALL NOT be an environment variable.
6. THE `POST /advisor/chat` route SHALL be configured with CORS to allow the frontend origin.
