import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { APIGatewayProxyEvent } from "aws-lambda";

/**
 * Bug Condition Exploration Test
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 *
 * Property 1: Bug Condition — Encoded SK Returns 404 on Unfixed Handlers
 *
 * This test is EXPECTED TO FAIL on unfixed code. Failure confirms the bug exists:
 * handlers pass the URL-encoded sk (e.g. TRANS%232026-03%23EXP%23...) directly to
 * DynamoDB instead of decoding it first to TRANS#2026-03#EXP#<uuid>.
 */

// --- DynamoDB mock setup ---
// We mock the DynamoDB DocumentClient send method. The mock returns items ONLY
// when the key uses the DECODED sk value. If the handler passes the encoded sk,
// the mock returns no item → handler returns 404.

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send: mockSend })),
    },
    GetCommand: vi.fn((input: unknown) => ({ _type: "GetCommand", input })),
    UpdateCommand: vi.fn((input: unknown) => ({ _type: "UpdateCommand", input })),
    DeleteCommand: vi.fn((input: unknown) => ({ _type: "DeleteCommand", input })),
    QueryCommand: vi.fn((input: unknown) => ({ _type: "QueryCommand", input })),
    BatchWriteCommand: vi.fn((input: unknown) => ({ _type: "BatchWriteCommand", input })),
  };
});

// Helper: build a mock APIGatewayProxyEvent
function makeEvent(overrides: {
  sk?: string;
  method?: string;
  body?: string | null;
  queryStringParameters?: Record<string, string> | null;
  authenticated?: boolean;
}): APIGatewayProxyEvent {
  const {
    sk,
    method = "GET",
    body = null,
    queryStringParameters = null,
    authenticated = true,
  } = overrides;

  return {
    httpMethod: method,
    pathParameters: sk !== undefined ? { sk } : null,
    body,
    queryStringParameters,
    requestContext: {
      authorizer: authenticated
        ? { claims: { sub: "user-123" } }
        : undefined,
    } as unknown as APIGatewayProxyEvent["requestContext"],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/transactions/${sk ?? ""}`,
    resource: "/transactions/{sk}",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

// Arbitrary that generates a decoded SK in the format TRANS#YYYY-MM#TYPE#UUID
// then returns the URL-encoded version (which contains %23).
const encodedSkArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    type: fc.constantFrom("EXP", "INC"),
    uuid: fc.uuid(),
  })
  .map(({ year, month, type, uuid }) => {
    const mm = String(month).padStart(2, "0");
    const decoded = `TRANS#${year}-${mm}#${type}#${uuid}`;
    const encoded = encodeURIComponent(decoded);
    return { decoded, encoded };
  });

// Valid body for PUT requests (matches UpdateTransactionSchema)
const validUpdateBody = JSON.stringify({
  description: "Test transaction",
  amount: 100,
  date: "2026-03-15",
  type: "EXP",
  source: "Nubank",
  category: "Food",
});

// Configure mockSend to return items only when the DECODED sk is used
function setupMockSend(decodedSk: string) {
  const pk = "USER#user-123";

  mockSend.mockImplementation((command: { _type: string; input: { TableName: string; Key?: { pk: string; sk: string } } }) => {
    const key = command.input?.Key;

    if (command._type === "GetCommand") {
      if (key && key.pk === pk && key.sk === decodedSk) {
        return Promise.resolve({
          Item: {
            pk,
            sk: decodedSk,
            description: "Test",
            amount: 100,
            date: "2026-03-15",
            type: "EXP",
            source: "Nubank",
            category: "Food",
            groupId: "group-1",
          },
        });
      }
      return Promise.resolve({ Item: undefined });
    }

    if (command._type === "UpdateCommand") {
      if (key && key.pk === pk && key.sk === decodedSk) {
        return Promise.resolve({
          Attributes: {
            pk,
            sk: decodedSk,
            description: "Test transaction",
            amount: 100,
            date: "2026-03-15",
            type: "EXP",
            source: "Nubank",
            category: "Food",
          },
        });
      }
      // Simulate ConditionalCheckFailedException for wrong key
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      return Promise.reject(err);
    }

    if (command._type === "DeleteCommand") {
      if (key && key.pk === pk && key.sk === decodedSk) {
        return Promise.resolve({});
      }
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      return Promise.reject(err);
    }

    if (command._type === "QueryCommand") {
      return Promise.resolve({
        Items: [{ pk, sk: decodedSk }],
      });
    }

    if (command._type === "BatchWriteCommand") {
      return Promise.resolve({});
    }

    return Promise.resolve({});
  });
}

describe("Bug Condition: Encoded SK Returns 404 on Unfixed Handlers", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    mockSend.mockReset();
  });

  /**
   * **Validates: Requirements 1.1**
   *
   * Property: For any sk containing '%23' (URL-encoded '#'),
   * the GET handler should decode it and return 200.
   * On UNFIXED code, this will return 404 — confirming the bug.
   */
  it("GET handler with encoded sk should return 200", async () => {
    const { handler } = await import(
      "../../src/transactions/get-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(encodedSkArb, async ({ decoded, encoded }) => {
        mockSend.mockReset();
        setupMockSend(decoded);

        const event = makeEvent({ sk: encoded, method: "GET" });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirements 1.2**
   *
   * Property: For any sk containing '%23' (URL-encoded '#'),
   * the PUT handler should decode it and return 200.
   * On UNFIXED code, this will return 404 — confirming the bug.
   */
  it("PUT handler with encoded sk should return 200", async () => {
    const { handler } = await import(
      "../../src/transactions/update-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(encodedSkArb, async ({ decoded, encoded }) => {
        mockSend.mockReset();
        setupMockSend(decoded);

        const event = makeEvent({
          sk: encoded,
          method: "PUT",
          body: validUpdateBody,
        });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * Property: For any sk containing '%23' (URL-encoded '#'),
   * the DELETE (single) handler should decode it and return 200.
   * On UNFIXED code, this will return 404 — confirming the bug.
   */
  it("DELETE single handler with encoded sk should return 200", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(encodedSkArb, async ({ decoded, encoded }) => {
        mockSend.mockReset();
        setupMockSend(decoded);

        const event = makeEvent({ sk: encoded, method: "DELETE" });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * Property: For any sk containing '%23' (URL-encoded '#'),
   * the DELETE (group) handler should decode it and return 200.
   * On UNFIXED code, this will return 404 — confirming the bug.
   */
  it("DELETE group handler with encoded sk should return 200", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(encodedSkArb, async ({ decoded, encoded }) => {
        mockSend.mockReset();
        setupMockSend(decoded);

        const event = makeEvent({
          sk: encoded,
          method: "DELETE",
          queryStringParameters: { deleteGroup: "true" },
        });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }),
      { numRuns: 20 }
    );
  });
});
