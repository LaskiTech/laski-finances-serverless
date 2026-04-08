import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { APIGatewayProxyEvent } from "aws-lambda";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  QueryCommand: vi.fn((input: unknown) => ({ _type: "QueryCommand", input })),
}));

function makeEvent(queryParams?: Record<string, string>): APIGatewayProxyEvent {
  return {
    httpMethod: "GET",
    body: null,
    pathParameters: null,
    queryStringParameters: queryParams ?? null,
    requestContext: {
      requestId: "req-1",
      authorizer: { claims: { sub: "user-123" } },
    } as unknown as APIGatewayProxyEvent["requestContext"],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: "/transactions",
    resource: "/transactions",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

function makeEventNoAuth(): APIGatewayProxyEvent {
  return {
    ...makeEvent(),
    requestContext: {
      requestId: "req-1",
      authorizer: {},
    } as unknown as APIGatewayProxyEvent["requestContext"],
  };
}

describe("list-transactions handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
    mockSend.mockResolvedValue({ Items: [] });
  });

  // --- SK prefix construction ---

  it("uses TRANS# prefix when no params given", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await handler(makeEvent());

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#");
    expect(cmd.input.FilterExpression).toBeUndefined();
  });

  it("uses TRANS#YYYY-MM# prefix when only month given", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await handler(makeEvent({ month: "2026-03" }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#2026-03#");
    expect(cmd.input.FilterExpression).toBeUndefined();
  });

  it("uses TRANS#YYYY-MM#EXP# prefix when month and type=EXP given", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await handler(makeEvent({ month: "2026-03", type: "EXP" }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#2026-03#EXP#");
    expect(cmd.input.FilterExpression).toBeUndefined();
  });

  it("uses TRANS#YYYY-MM#INC# prefix when month and type=INC given", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await handler(makeEvent({ month: "2026-04", type: "INC" }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#2026-04#INC#");
  });

  // --- Bug regression: type filter without month must use FilterExpression ---

  it("applies FilterExpression for type=EXP when no month given", async () => {
    // Regression: previously, type was silently ignored when month was absent,
    // causing listTransactions(undefined, 'EXP') to return ALL items.
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await handler(makeEvent({ type: "EXP" }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#");
    expect(cmd.input.FilterExpression).toContain("#type = :type");
    expect(cmd.input.ExpressionAttributeValues[":type"]).toBe("EXP");
    expect(cmd.input.ExpressionAttributeNames?.["#type"]).toBe("type");
  });

  it("applies FilterExpression for type=INC when no month given", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await handler(makeEvent({ type: "INC" }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#");
    expect(cmd.input.FilterExpression).toContain("#type = :type");
    expect(cmd.input.ExpressionAttributeValues[":type"]).toBe("INC");
  });

  // --- Response shape ---

  it("returns transactions array in response body", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");
    const items = [
      { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc", type: "EXP", amount: 1000 },
      { pk: "USER#user-123", sk: "TRANS#2026-03#INC#def", type: "INC", amount: 500 },
    ];
    mockSend.mockResolvedValueOnce({ Items: items });

    const result = await handler(makeEvent({ month: "2026-03" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.transactions).toEqual(items);
  });

  it("returns nextKey=null when no LastEvaluatedKey in result", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");
    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.nextKey).toBeNull();
  });

  it("returns base64-encoded nextKey when DynamoDB returns LastEvaluatedKey", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");
    const lastEvaluatedKey = { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc" };
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: lastEvaluatedKey });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.nextKey).toBe(Buffer.from(JSON.stringify(lastEvaluatedKey)).toString("base64"));
  });

  // --- Pagination ---

  it("passes decoded ExclusiveStartKey when lastKey param is provided", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");
    const cursor = { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc" };
    const lastKey = Buffer.from(JSON.stringify(cursor)).toString("base64");

    await handler(makeEvent({ lastKey }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExclusiveStartKey).toEqual(cursor);
  });

  it("returns 400 when lastKey is not valid base64 JSON", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    const result = await handler(makeEvent({ lastKey: "not-valid-base64-json!!!" }));

    expect(result.statusCode).toBe(400);
  });

  // --- Validation ---

  it("returns 400 when month format is invalid", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    const result = await handler(makeEvent({ month: "2026/03" }));

    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when type is not INC or EXP", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    const result = await handler(makeEvent({ type: "OTHER" }));

    expect(result.statusCode).toBe(400);
  });

  // --- Auth ---

  it("returns 401 when userId is missing from authorizer claims", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    const result = await handler(makeEventNoAuth());

    expect(result.statusCode).toBe(401);
  });

  // --- Property tests ---

  // Feature: list-transactions, Property 1: SK prefix is always rooted at TRANS#
  it("Property 1: SK prefix always begins with TRANS# regardless of params", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          month: fc.option(
            fc.tuple(
              fc.integer({ min: 2020, max: 2030 }).map(String),
              fc.integer({ min: 1, max: 12 }).map((m) => String(m).padStart(2, "0")),
            ).map(([y, m]) => `${y}-${m}`),
            { nil: undefined },
          ),
          type: fc.option(fc.constantFrom("INC", "EXP"), { nil: undefined }),
        }),
        async ({ month, type }) => {
          mockSend.mockResolvedValueOnce({ Items: [] });
          const params: Record<string, string> = {};
          if (month) params.month = month;
          if (type) params.type = type;

          await handler(makeEvent(Object.keys(params).length ? params : undefined));

          const cmd = mockSend.mock.calls[mockSend.mock.calls.length - 1][0];
          const prefix: string = cmd.input.ExpressionAttributeValues[":skPrefix"];
          expect(prefix).toMatch(/^TRANS#/);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: list-transactions, Property 2: type filter without month always sets FilterExpression
  it("Property 2: when type is given without month, FilterExpression is always set", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("INC", "EXP"),
        async (type) => {
          mockSend.mockResolvedValueOnce({ Items: [] });

          await handler(makeEvent({ type }));

          const cmd = mockSend.mock.calls[mockSend.mock.calls.length - 1][0];
          expect(cmd.input.FilterExpression).toBeDefined();
          expect(cmd.input.ExpressionAttributeValues[":type"]).toBe(type);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: list-transactions, Property 3: month+type uses SK prefix only, no FilterExpression
  it("Property 3: when both month and type are given, no FilterExpression is used", async () => {
    const { handler } = await import("../../src/transactions/list-transactions.js");

    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.integer({ min: 2020, max: 2030 }).map(String),
          fc.integer({ min: 1, max: 12 }).map((m) => String(m).padStart(2, "0")),
        ).map(([y, m]) => `${y}-${m}`),
        fc.constantFrom("INC" as const, "EXP" as const),
        async (month, type) => {
          mockSend.mockResolvedValueOnce({ Items: [] });

          await handler(makeEvent({ month, type }));

          const cmd = mockSend.mock.calls[mockSend.mock.calls.length - 1][0];
          expect(cmd.input.FilterExpression).toBeUndefined();
          expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe(`TRANS#${month}#${type}#`);
        },
      ),
      { numRuns: 100 },
    );
  });
});
