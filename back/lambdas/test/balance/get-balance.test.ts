import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: "GetCommand", input })),
  QueryCommand: vi.fn((input: unknown) => ({ _type: "QueryCommand", input })),
}));

function makeEvent(
  queryStringParameters: Record<string, string> | null = null,
  sub: string | null = "user-123"
): APIGatewayProxyEvent {
  return {
    httpMethod: "GET",
    body: null,
    pathParameters: null,
    queryStringParameters,
    requestContext: {
      requestId: "req-1",
      authorizer: sub ? { claims: { sub } } : undefined,
    } as unknown as APIGatewayProxyEvent["requestContext"],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: "/balance",
    resource: "/balance",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("get-balance handler", () => {
  beforeEach(() => {
    vi.stubEnv("SUMMARY_TABLE_NAME", "laskifin-MonthlySummary");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
  });

  it("no params → returns current month (mock Date)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-08-15T12:00:00Z"));

    mockSend.mockResolvedValueOnce({
      Item: {
        pk: "USER#user-123",
        sk: "SUMMARY#2024-08",
        totalIncome: 3000,
        totalExpenses: 1500,
        transactionCount: 10,
      },
    });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.month).toBe("2024-08");
    expect(body.totalIncome).toBe(3000);
    expect(body.totalExpenses).toBe(1500);
    expect(body.balance).toBe(1500);
    expect(body.transactionCount).toBe(10);

    vi.useRealTimers();
  });

  it("?month=2024-06 → correct GetCommand key", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        pk: "USER#user-123",
        sk: "SUMMARY#2024-06",
        totalIncome: 5000,
        totalExpenses: 3200,
        transactionCount: 24,
      },
    });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ month: "2024-06" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.month).toBe("2024-06");
    expect(body.balance).toBe(1800);

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe("GetCommand");
    expect(cmd.input.Key).toEqual({
      pk: "USER#user-123",
      sk: "SUMMARY#2024-06",
    });
  });

  it("?from=2024-01&to=2024-03 → correct QueryCommand with BETWEEN", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { sk: "SUMMARY#2024-01", totalIncome: 1000, totalExpenses: 500, transactionCount: 5 },
        { sk: "SUMMARY#2024-02", totalIncome: 2000, totalExpenses: 800, transactionCount: 8 },
        { sk: "SUMMARY#2024-03", totalIncome: 1500, totalExpenses: 600, transactionCount: 6 },
      ],
    });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2024-01", to: "2024-03" }));

    expect(result.statusCode).toBe(200);

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd._type).toBe("QueryCommand");
    expect(cmd.input.KeyConditionExpression).toBe(
      "pk = :pk AND sk BETWEEN :from AND :to"
    );
    expect(cmd.input.ExpressionAttributeValues).toEqual({
      ":pk": "USER#user-123",
      ":from": "SUMMARY#2024-01",
      ":to": "SUMMARY#2024-03",
    });

    const body = JSON.parse(result.body);
    expect(body.months).toHaveLength(3);
    expect(body.from).toBe("2024-01");
    expect(body.to).toBe("2024-03");
  });

  it("range with all months present → no zero-fill", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { sk: "SUMMARY#2024-04", totalIncome: 1000, totalExpenses: 400, transactionCount: 3 },
        { sk: "SUMMARY#2024-05", totalIncome: 2000, totalExpenses: 900, transactionCount: 7 },
      ],
    });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2024-04", to: "2024-05" }));

    const body = JSON.parse(result.body);
    expect(body.months).toHaveLength(2);
    expect(body.months[0]).toEqual({
      month: "2024-04",
      totalIncome: 1000,
      totalExpenses: 400,
      balance: 600,
      transactionCount: 3,
    });
    expect(body.months[1]).toEqual({
      month: "2024-05",
      totalIncome: 2000,
      totalExpenses: 900,
      balance: 1100,
      transactionCount: 7,
    });
  });

  it("range with missing months → correct zero-fill", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { sk: "SUMMARY#2024-01", totalIncome: 1000, totalExpenses: 500, transactionCount: 5 },
        // 2024-02 missing
        { sk: "SUMMARY#2024-03", totalIncome: 1500, totalExpenses: 600, transactionCount: 6 },
      ],
    });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2024-01", to: "2024-03" }));

    const body = JSON.parse(result.body);
    expect(body.months).toHaveLength(3);
    expect(body.months[1]).toEqual({
      month: "2024-02",
      totalIncome: 0,
      totalExpenses: 0,
      balance: 0,
      transactionCount: 0,
    });
  });

  it("from === to → months.length === 1", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { sk: "SUMMARY#2024-06", totalIncome: 3000, totalExpenses: 1200, transactionCount: 10 },
      ],
    });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2024-06", to: "2024-06" }));

    const body = JSON.parse(result.body);
    expect(body.months).toHaveLength(1);
    expect(body.months[0].month).toBe("2024-06");
  });

  it("month + from together → HTTP 400", async () => {
    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(
      makeEvent({ month: "2024-06", from: "2024-01" })
    );

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("mutually exclusive");
  });

  it("from without to → HTTP 400", async () => {
    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2024-01" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Both from and to are required");
  });

  it("from after to → HTTP 400", async () => {
    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2024-06", to: "2024-01" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("from must not be after to");
  });

  it("range of exactly 24 months → HTTP 200", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2023-01", to: "2024-12" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.months).toHaveLength(24);
  });

  it("range of 25 months → HTTP 400", async () => {
    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ from: "2023-01", to: "2025-01" }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("24 months");
  });

  it("missing auth sub → HTTP 401", async () => {
    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent(null, null));

    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.error).toBe("Unauthorized");
  });

  it("DynamoDB throws → HTTP 500", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB connection error"));

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ month: "2024-06" }));

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toBe("Internal server error");
  });

  it("empty month (no item) → HTTP 200 with all zeros", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const { handler } = await import("../../src/balance/get-balance.js");
    const result = await handler(makeEvent({ month: "2024-06" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toEqual({
      month: "2024-06",
      totalIncome: 0,
      totalExpenses: 0,
      balance: 0,
      transactionCount: 0,
    });
  });
});
