import { describe, it, expect, vi, beforeEach } from "vitest";
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
    path: "/income",
    resource: "/income",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("list-income handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
  });

  it("queries with INC SK prefix when month is provided", async () => {
    const { handler } = await import("../../src/income/list-income.js");
    mockSend.mockResolvedValue({ Items: [] });

    await handler(makeEvent({ month: "2026-03" }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#2026-03#INC#");
  });

  it("filters by type=INC when no month provided", async () => {
    const { handler } = await import("../../src/income/list-income.js");
    mockSend.mockResolvedValue({ Items: [] });

    await handler(makeEvent());

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":skPrefix"]).toBe("TRANS#");
    expect(cmd.input.FilterExpression).toContain("#type = :inc");
  });

  it("adds isRecurring filter when recurring=true", async () => {
    const { handler } = await import("../../src/income/list-income.js");
    mockSend.mockResolvedValue({ Items: [] });

    await handler(makeEvent({ recurring: "true" }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.FilterExpression).toContain("isRecurring = :isRecurring");
  });

  it("returns income items in response", async () => {
    const { handler } = await import("../../src/income/list-income.js");
    const items = [{ pk: "USER#user-123", sk: "TRANS#2026-03#INC#abc", type: "INC", amount: 1000 }];
    mockSend.mockResolvedValue({ Items: items });

    const result = await handler(makeEvent({ month: "2026-03" }));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.income).toEqual(items);
  });
});
