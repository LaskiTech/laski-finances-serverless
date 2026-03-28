import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { APIGatewayProxyEvent } from "aws-lambda";

/**
 * Preservation Property Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * Property 2: Preservation — Non-Encoded SK and Error Handling Behavior Unchanged
 *
 * These tests capture the baseline behavior of the UNFIXED code for all inputs
 * where isBugCondition is false. They must PASS on unfixed code and continue
 * to pass after the fix is applied.
 */

// --- DynamoDB mock setup ---
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

// --- Arbitraries ---

// Non-encoded SK: format TRANS#YYYY-MM#TYPE#UUID — no %23 present
const nonEncodedSkArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    type: fc.constantFrom("EXP", "INC"),
    uuid: fc.uuid(),
  })
  .map(({ year, month, type, uuid }) => {
    const mm = String(month).padStart(2, "0");
    return `TRANS#${year}-${mm}#${type}#${uuid}`;
  });

// Valid body for PUT requests (matches UpdateTransactionSchema)
const validUpdateBodyArb = fc
  .record({
    description: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    amount: fc.double({ min: 0.01, max: 100000, noNaN: true }),
    date: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }).map((d) => d.toISOString().slice(0, 10)),
    type: fc.constantFrom("INC" as const, "EXP" as const),
    source: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    category: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  })
  .map((body) => JSON.stringify(body));

// Invalid body for PUT requests — missing required fields
const invalidUpdateBodyArb = fc.constantFrom(
  JSON.stringify({}),
  JSON.stringify({ description: "" }),
  JSON.stringify({ amount: -5, description: "x", date: "bad", type: "WRONG", source: "s", category: "c" }),
  JSON.stringify({ description: "x", amount: 100 }), // missing fields
  "not-json-at-all",
);

// Configure mockSend to return items for a given sk (non-encoded, exact match)
function setupMockForExistingItem(sk: string) {
  const pk = "USER#user-123";

  mockSend.mockImplementation((command: { _type: string; input: { TableName: string; Key?: { pk: string; sk: string } } }) => {
    const key = command.input?.Key;

    if (command._type === "GetCommand") {
      if (key && key.pk === pk && key.sk === sk) {
        return Promise.resolve({
          Item: {
            pk,
            sk,
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
      if (key && key.pk === pk && key.sk === sk) {
        return Promise.resolve({
          Attributes: {
            pk,
            sk,
            description: "Updated",
            amount: 200,
            date: "2026-03-15",
            type: "EXP",
            source: "Nubank",
            category: "Food",
          },
        });
      }
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      return Promise.reject(err);
    }

    if (command._type === "DeleteCommand") {
      if (key && key.pk === pk && key.sk === sk) {
        return Promise.resolve({});
      }
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      return Promise.reject(err);
    }

    if (command._type === "QueryCommand") {
      return Promise.resolve({
        Items: [{ pk, sk }],
      });
    }

    if (command._type === "BatchWriteCommand") {
      return Promise.resolve({});
    }

    return Promise.resolve({});
  });
}

// Configure mockSend to return NO items (non-existent sk)
function setupMockForMissingItem() {
  const pk = "USER#user-123";

  mockSend.mockImplementation((command: { _type: string; input: unknown }) => {
    if (command._type === "GetCommand") {
      return Promise.resolve({ Item: undefined });
    }

    if (command._type === "UpdateCommand") {
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      return Promise.reject(err);
    }

    if (command._type === "DeleteCommand") {
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      return Promise.reject(err);
    }

    if (command._type === "QueryCommand") {
      return Promise.resolve({ Items: [] });
    }

    return Promise.resolve({});
  });
}

describe("Preservation: Non-Encoded SK and Error Handling Behavior Unchanged", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    mockSend.mockReset();
  });

  // ---------------------------------------------------------------
  // 1. Non-encoded SK with existing item → 200
  // ---------------------------------------------------------------

  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For all non-encoded sk values (no %23), GET handler returns 200
   * when the item exists in DynamoDB.
   */
  it("GET with non-encoded sk and existing item returns 200", async () => {
    const { handler } = await import(
      "../../src/transactions/get-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        mockSend.mockReset();
        setupMockForExistingItem(sk);

        const event = makeEvent({ sk, method: "GET" });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.sk).toBe(sk);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For all non-encoded sk values (no %23), PUT handler returns 200
   * when the item exists and body is valid.
   */
  it("PUT with non-encoded sk, valid body, and existing item returns 200", async () => {
    const { handler } = await import(
      "../../src/transactions/update-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, validUpdateBodyArb, async (sk, body) => {
        mockSend.mockReset();
        setupMockForExistingItem(sk);

        const event = makeEvent({ sk, method: "PUT", body });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For all non-encoded sk values (no %23), DELETE single handler
   * returns 200 when the item exists.
   */
  it("DELETE single with non-encoded sk and existing item returns 200", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        mockSend.mockReset();
        setupMockForExistingItem(sk);

        const event = makeEvent({ sk, method: "DELETE" });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For all non-encoded sk values (no %23), DELETE group handler
   * returns 200 when the item exists.
   */
  it("DELETE group with non-encoded sk and existing item returns 200", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        mockSend.mockReset();
        setupMockForExistingItem(sk);

        const event = makeEvent({
          sk,
          method: "DELETE",
          queryStringParameters: { deleteGroup: "true" },
        });
        const result = await handler(event);

        expect(result.statusCode).toBe(200);
      }),
      { numRuns: 20 }
    );
  });

  // ---------------------------------------------------------------
  // 2. Missing SK → 400 "Missing transaction key"
  // ---------------------------------------------------------------

  /**
   * **Validates: Requirements 3.2**
   *
   * Property: For all unauthenticated requests with missing sk,
   * GET/PUT/DELETE handlers return 400 "Missing transaction key".
   */
  it("GET with missing sk returns 400", async () => {
    const { handler } = await import(
      "../../src/transactions/get-transaction.js"
    );

    const event = makeEvent({ method: "GET" }); // sk is undefined
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe("Missing transaction key");
  });

  it("PUT with missing sk returns 400", async () => {
    const { handler } = await import(
      "../../src/transactions/update-transaction.js"
    );

    const event = makeEvent({ method: "PUT", body: JSON.stringify({ description: "x", amount: 1, date: "2026-01-01", type: "EXP", source: "s", category: "c" }) });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe("Missing transaction key");
  });

  it("DELETE with missing sk returns 400", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    const event = makeEvent({ method: "DELETE" });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe("Missing transaction key");
  });

  // ---------------------------------------------------------------
  // 3. Unauthenticated requests → 401 "Unauthorized"
  // ---------------------------------------------------------------

  /**
   * **Validates: Requirements 3.4**
   *
   * Property: For all requests without Cognito claims,
   * handlers return 401 "Unauthorized" regardless of sk value.
   */
  it("GET with unauthenticated request returns 401", async () => {
    const { handler } = await import(
      "../../src/transactions/get-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        const event = makeEvent({ sk, method: "GET", authenticated: false });
        const result = await handler(event);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.error).toBe("Unauthorized");
      }),
      { numRuns: 10 }
    );
  });

  it("PUT with unauthenticated request returns 401", async () => {
    const { handler } = await import(
      "../../src/transactions/update-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        const event = makeEvent({
          sk,
          method: "PUT",
          body: JSON.stringify({ description: "x", amount: 1, date: "2026-01-01", type: "EXP", source: "s", category: "c" }),
          authenticated: false,
        });
        const result = await handler(event);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.error).toBe("Unauthorized");
      }),
      { numRuns: 10 }
    );
  });

  it("DELETE with unauthenticated request returns 401", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        const event = makeEvent({ sk, method: "DELETE", authenticated: false });
        const result = await handler(event);

        expect(result.statusCode).toBe(401);
        const body = JSON.parse(result.body);
        expect(body.error).toBe("Unauthorized");
      }),
      { numRuns: 10 }
    );
  });

  // ---------------------------------------------------------------
  // 4. Non-existent item → 404 "Transaction not found"
  // ---------------------------------------------------------------

  /**
   * **Validates: Requirements 3.3**
   *
   * Property: For all non-encoded sk values where the item does not exist
   * in DynamoDB, handlers return 404 "Transaction not found".
   */
  it("GET with non-existent item returns 404", async () => {
    const { handler } = await import(
      "../../src/transactions/get-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        mockSend.mockReset();
        setupMockForMissingItem();

        const event = makeEvent({ sk, method: "GET" });
        const result = await handler(event);

        expect(result.statusCode).toBe(404);
        const body = JSON.parse(result.body);
        expect(body.error).toBe("Transaction not found");
      }),
      { numRuns: 20 }
    );
  });

  it("PUT with non-existent item returns 404", async () => {
    const { handler } = await import(
      "../../src/transactions/update-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, validUpdateBodyArb, async (sk, body) => {
        mockSend.mockReset();
        setupMockForMissingItem();

        const event = makeEvent({ sk, method: "PUT", body });
        const result = await handler(event);

        expect(result.statusCode).toBe(404);
        const parsedBody = JSON.parse(result.body);
        expect(parsedBody.error).toBe("Transaction not found");
      }),
      { numRuns: 20 }
    );
  });

  it("DELETE single with non-existent item returns 404", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        mockSend.mockReset();
        setupMockForMissingItem();

        const event = makeEvent({ sk, method: "DELETE" });
        const result = await handler(event);

        expect(result.statusCode).toBe(404);
        const body = JSON.parse(result.body);
        expect(body.error).toBe("Transaction not found");
      }),
      { numRuns: 20 }
    );
  });

  it("DELETE group with non-existent item returns 404", async () => {
    const { handler } = await import(
      "../../src/transactions/delete-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, async (sk) => {
        mockSend.mockReset();
        setupMockForMissingItem();

        const event = makeEvent({
          sk,
          method: "DELETE",
          queryStringParameters: { deleteGroup: "true" },
        });
        const result = await handler(event);

        expect(result.statusCode).toBe(404);
        const body = JSON.parse(result.body);
        expect(body.error).toBe("Transaction not found");
      }),
      { numRuns: 20 }
    );
  });

  // ---------------------------------------------------------------
  // 5. PUT with invalid body → 400 validation errors
  // ---------------------------------------------------------------

  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For PUT requests with invalid body, handler returns 400
   * with validation error messages.
   */
  it("PUT with invalid body returns 400", async () => {
    const { handler } = await import(
      "../../src/transactions/update-transaction.js"
    );

    await fc.assert(
      fc.asyncProperty(nonEncodedSkArb, invalidUpdateBodyArb, async (sk, body) => {
        mockSend.mockReset();
        setupMockForExistingItem(sk);

        const event = makeEvent({ sk, method: "PUT", body });
        const result = await handler(event);

        expect(result.statusCode).toBe(400);
      }),
      { numRuns: 10 }
    );
  });
});
