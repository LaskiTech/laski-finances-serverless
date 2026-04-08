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
    DeleteCommand: vi.fn((input: unknown) => ({ _type: "DeleteCommand", input })),
    QueryCommand: vi.fn((input: unknown) => ({ _type: "QueryCommand", input })),
    BatchWriteCommand: vi.fn((input: unknown) => ({ _type: "BatchWriteCommand", input })),
    UpdateCommand: vi.fn((input: unknown) => ({ _type: "UpdateCommand", input })),
  };
});

function makeEvent(sk: string, deleteGroup?: boolean): APIGatewayProxyEvent {
  return {
    httpMethod: "DELETE",
    body: null,
    pathParameters: { sk },
    queryStringParameters: deleteGroup ? { deleteGroup: "true" } : null,
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

describe("delete-transaction handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("SUMMARY_TABLE_NAME", "laskifin-MonthlySummary");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
  });

  it("subtracts from MonthlySummary on single delete", async () => {
    const { handler } = await import("../../src/transactions/delete-transaction.js");

    mockSend
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc", amount: 100, type: "EXP", date: "2026-03-15" } }) // GetCommand
      .mockResolvedValueOnce({}) // DeleteCommand
      .mockResolvedValueOnce({}); // UpdateCommand (summary)

    const event = makeEvent("TRANS%232026-03%23EXP%23abc");
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    // Last call should be summary update (subtract)
    const summaryCmd = mockSend.mock.calls[2][0];
    expect(summaryCmd._type).toBe("UpdateCommand");
    expect(summaryCmd.input.TableName).toBe("laskifin-MonthlySummary");
    expect(summaryCmd.input.ExpressionAttributeValues[":delta"]).toBe(-100);
  });

  it("subtracts from MonthlySummary for each item in group delete", async () => {
    const { handler } = await import("../../src/transactions/delete-transaction.js");

    const items = [
      { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#a1", amount: 100, type: "EXP", date: "2026-03-15", groupId: "g1" },
      { pk: "USER#user-123", sk: "TRANS#2026-04#EXP#a2", amount: 100, type: "EXP", date: "2026-04-15", groupId: "g1" },
    ];

    mockSend
      .mockResolvedValueOnce({ Item: items[0] }) // GetCommand
      .mockResolvedValueOnce({ Items: items }) // QueryCommand
      .mockResolvedValueOnce({}) // BatchWriteCommand
      .mockResolvedValueOnce({}) // summary subtract item 0
      .mockResolvedValueOnce({}); // summary subtract item 1

    const event = makeEvent("TRANS%232026-03%23EXP%23a1", true);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    // Should have 2 summary update calls
    expect(mockSend.mock.calls[3][0]._type).toBe("UpdateCommand");
    expect(mockSend.mock.calls[4][0]._type).toBe("UpdateCommand");
  });
});
