import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send: mockSend })),
    },
    BatchWriteCommand: vi.fn((input: unknown) => ({ _type: "BatchWriteCommand", input })),
    UpdateCommand: vi.fn((input: unknown) => ({ _type: "UpdateCommand", input })),
  };
});

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
    path: "/transactions",
    resource: "/transactions",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("create-transaction handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("SUMMARY_TABLE_NAME", "laskifin-MonthlySummary");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  it("normalizes category and source to lowercase trimmed", async () => {
    const { handler } = await import("../../src/transactions/create-transaction.js");

    const event = makeEvent({
      description: "Test",
      totalAmount: 100,
      installments: 1,
      date: "2026-03-15",
      category: "  Food  ",
      source: "  Nubank  ",
      type: "EXP",
    });

    await handler(event);

    // First call is BatchWriteCommand
    const batchCmd = mockSend.mock.calls[0][0];
    const item = batchCmd.input.RequestItems["laskifin-Ledger"][0].PutRequest.Item;
    expect(item.category).toBe("food");
    expect(item.source).toBe("nubank");
  });

  it("includes categoryMonth on created items", async () => {
    const { handler } = await import("../../src/transactions/create-transaction.js");

    const event = makeEvent({
      description: "Test",
      totalAmount: 100,
      installments: 1,
      date: "2026-03-15",
      category: "Food",
      source: "Nubank",
      type: "EXP",
    });

    await handler(event);

    const batchCmd = mockSend.mock.calls[0][0];
    const item = batchCmd.input.RequestItems["laskifin-Ledger"][0].PutRequest.Item;
    expect(item.categoryMonth).toBe("food#2026-03");
  });

  it("calls updateMonthlySummary for each created item", async () => {
    const { handler } = await import("../../src/transactions/create-transaction.js");

    const event = makeEvent({
      description: "Test",
      totalAmount: 300,
      installments: 3,
      date: "2026-03-15",
      category: "Food",
      source: "Nubank",
      type: "EXP",
    });

    await handler(event);

    // 1 BatchWrite + 3 UpdateCommand (summary calls)
    expect(mockSend).toHaveBeenCalledTimes(4);
    // Last 3 calls should be summary updates
    for (let i = 1; i <= 3; i++) {
      const cmd = mockSend.mock.calls[i][0];
      expect(cmd._type).toBe("UpdateCommand");
      expect(cmd.input.TableName).toBe("laskifin-MonthlySummary");
    }
  });
});
