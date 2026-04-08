import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: "GetCommand", input })),
}));

function makeEvent(sk: string): APIGatewayProxyEvent {
  return {
    httpMethod: "GET",
    body: null,
    pathParameters: { sk },
    queryStringParameters: null,
    requestContext: {
      requestId: "req-1",
      authorizer: { claims: { sub: "user-123" } },
    } as unknown as APIGatewayProxyEvent["requestContext"],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/income/${sk}`,
    resource: "/income/{sk}",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("get-income handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
  });

  it("returns income item when type is INC", async () => {
    const { handler } = await import("../../src/income/get-income.js");
    const item = { pk: "USER#user-123", sk: "TRANS#2026-03#INC#abc", type: "INC", amount: 1000 };
    mockSend.mockResolvedValue({ Item: item });

    const result = await handler(makeEvent("TRANS%232026-03%23INC%23abc"));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.type).toBe("INC");
  });

  it("returns 404 when type is not INC", async () => {
    const { handler } = await import("../../src/income/get-income.js");
    mockSend.mockResolvedValue({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#abc", type: "EXP" } });

    const result = await handler(makeEvent("TRANS%232026-03%23EXP%23abc"));
    expect(result.statusCode).toBe(404);
  });

  it("returns 404 when item not found", async () => {
    const { handler } = await import("../../src/income/get-income.js");
    mockSend.mockResolvedValue({ Item: undefined });

    const result = await handler(makeEvent("TRANS%232026-03%23INC%23none"));
    expect(result.statusCode).toBe(404);
  });
});
