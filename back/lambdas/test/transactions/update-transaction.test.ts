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
    GetCommand: vi.fn((input: unknown) => ({ _type: "GetCommand", input })),
    UpdateCommand: vi.fn((input: unknown) => ({ _type: "UpdateCommand", input })),
  };
});

function makeEvent(sk: string, body: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    httpMethod: "PUT",
    body: JSON.stringify(body),
    pathParameters: { sk },
    queryStringParameters: null,
    requestContext: {
      requestId: "req-1",
      authorizer: { claims: { sub: "user-123" } },
    } as unknown as APIGatewayProxyEvent["requestContext"],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/transactions/${sk}`,
    resource: "/transactions/{sk}",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("update-transaction handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("SUMMARY_TABLE_NAME", "laskifin-MonthlySummary");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
  });

  it("reads existing item before update for summary subtraction", async () => {
    const { handler } = await import("../../src/transactions/update-transaction.js");
    const sk = "TRANS%232026-03%23EXP%23abc-123";

    mockSend
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc-123", amount: 50, type: "EXP", date: "2026-03-15" } }) // GetCommand
      .mockResolvedValueOnce({ Attributes: { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc-123" } }) // UpdateCommand
      .mockResolvedValueOnce({}) // subtract summary
      .mockResolvedValueOnce({}); // add summary

    const event = makeEvent(sk, {
      description: "Updated",
      amount: 100,
      date: "2026-03-15",
      type: "EXP",
      source: "Nubank",
      category: "Food",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    // First call should be GetCommand
    expect(mockSend.mock.calls[0][0]._type).toBe("GetCommand");
    // Second should be UpdateCommand
    expect(mockSend.mock.calls[1][0]._type).toBe("UpdateCommand");
    // Third & fourth should be summary updates
    expect(mockSend.mock.calls[2][0]._type).toBe("UpdateCommand");
    expect(mockSend.mock.calls[3][0]._type).toBe("UpdateCommand");
  });

  it("includes categoryMonth in update expression", async () => {
    const { handler } = await import("../../src/transactions/update-transaction.js");
    const sk = "TRANS%232026-03%23EXP%23abc-123";

    mockSend
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc-123", amount: 50, type: "EXP", date: "2026-03-15" } })
      .mockResolvedValueOnce({ Attributes: {} })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const event = makeEvent(sk, {
      description: "Updated",
      amount: 100,
      date: "2026-04-15",
      type: "EXP",
      source: "Nubank",
      category: "Transport",
    });

    await handler(event);

    const updateCmd = mockSend.mock.calls[1][0];
    expect(updateCmd.input.ExpressionAttributeValues[":categoryMonth"]).toBe("transport#2026-04");
  });

  it("returns 404 when existing item not found", async () => {
    const { handler } = await import("../../src/transactions/update-transaction.js");

    mockSend.mockResolvedValueOnce({ Item: undefined });

    const event = makeEvent("TRANS%232026-03%23EXP%23abc-123", {
      description: "Updated",
      amount: 100,
      date: "2026-03-15",
      type: "EXP",
      source: "Nubank",
      category: "Food",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });
});
