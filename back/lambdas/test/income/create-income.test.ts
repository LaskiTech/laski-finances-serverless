import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  BatchWriteCommand: vi.fn((input: unknown) => ({ _type: "BatchWriteCommand", input })),
  UpdateCommand: vi.fn((input: unknown) => ({ _type: "UpdateCommand", input })),
}));

function makeEvent(body: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    httpMethod: "POST",
    body: JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: "req-1",
      authorizer: { claims: { sub: "user-123" } },
    } as unknown as APIGatewayProxyEvent["requestContext"],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: "/income",
    resource: "/income",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("create-income handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("SUMMARY_TABLE_NAME", "laskifin-MonthlySummary");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  it("creates a single non-recurring income entry with type INC", async () => {
    const { handler } = await import("../../src/income/create-income.js");

    const event = makeEvent({
      description: "Salary",
      totalAmount: 5000,
      date: "2026-03-01",
      source: "Company",
      category: "Salary",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const batchCmd = mockSend.mock.calls[0][0];
    const item = batchCmd.input.RequestItems["laskifin-Ledger"][0].PutRequest.Item;
    expect(item.type).toBe("INC");
    expect(item.category).toBe("salary");
    expect(item.source).toBe("company");
    expect(item.categoryMonth).toBe("salary#2026-03");
    expect(item.isRecurring).toBeUndefined();
  });

  it("creates recurring income entries with isRecurring and recurringId", async () => {
    const { handler } = await import("../../src/income/create-income.js");

    const event = makeEvent({
      description: "Rent income",
      totalAmount: 1000,
      date: "2026-01-01",
      source: "Tenant",
      category: "Rent",
      recurrence: {
        frequency: "monthly",
        occurrences: 3,
      },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body.entriesCreated).toBe(3);
    expect(body.recurringId).toBeDefined();

    const batchCmd = mockSend.mock.calls[0][0];
    const items = batchCmd.input.RequestItems["laskifin-Ledger"];
    expect(items).toHaveLength(3);
    expect(items[0].PutRequest.Item.isRecurring).toBe(true);
    expect(items[0].PutRequest.Item.recurringId).toBeDefined();
  });

  it("calls updateMonthlySummary for each created entry", async () => {
    const { handler } = await import("../../src/income/create-income.js");

    const event = makeEvent({
      description: "Side gig",
      totalAmount: 200,
      date: "2026-06-01",
      source: "Freelance",
      category: "Freelance",
      recurrence: { frequency: "monthly", occurrences: 2 },
    });

    await handler(event);

    // 1 BatchWrite + 2 UpdateCommand (summary)
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend.mock.calls[1][0]._type).toBe("UpdateCommand");
    expect(mockSend.mock.calls[2][0]._type).toBe("UpdateCommand");
  });

  it("rejects when both endDate and occurrences provided", async () => {
    const { handler } = await import("../../src/income/create-income.js");

    const event = makeEvent({
      description: "Bad",
      totalAmount: 100,
      date: "2026-01-01",
      source: "X",
      category: "Y",
      recurrence: { frequency: "monthly", endDate: "2026-12-01", occurrences: 5 },
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});
