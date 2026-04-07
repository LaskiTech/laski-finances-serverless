import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: "GetCommand", input })),
  PutCommand: vi.fn((input: unknown) => ({ _type: "PutCommand", input })),
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
    path: "/links",
    resource: "/links",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("create-link handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("LINKS_TABLE_NAME", "laskifin-Links");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
  });

  it("creates a link when both entries exist", async () => {
    const { handler } = await import("../../src/links/create-link.js");

    mockSend
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#a" } }) // parent GetCommand
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#INC#b" } }) // child GetCommand
      .mockResolvedValueOnce({}); // PutCommand

    const result = await handler(makeEvent({
      parentSk: "TRANS#2026-03#EXP#a",
      childSk: "TRANS#2026-03#INC#b",
    }));

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.linkId).toBeDefined();
    expect(body.parentSk).toBe("TRANS#2026-03#EXP#a");
    expect(body.childSk).toBe("TRANS#2026-03#INC#b");
  });

  it("returns 404 when parent entry not found", async () => {
    const { handler } = await import("../../src/links/create-link.js");

    mockSend
      .mockResolvedValueOnce({ Item: undefined }) // parent not found
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#INC#b" } });

    const result = await handler(makeEvent({
      parentSk: "TRANS#2026-03#EXP#missing",
      childSk: "TRANS#2026-03#INC#b",
    }));

    expect(result.statusCode).toBe(404);
  });

  it("returns 409 when link already exists", async () => {
    const { handler } = await import("../../src/links/create-link.js");

    const err = new Error("ConditionalCheckFailedException");
    err.name = "ConditionalCheckFailedException";

    mockSend
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#EXP#a" } })
      .mockResolvedValueOnce({ Item: { pk: "USER#user-123", sk: "TRANS#2026-03#INC#b" } })
      .mockRejectedValueOnce(err);

    const result = await handler(makeEvent({
      parentSk: "TRANS#2026-03#EXP#a",
      childSk: "TRANS#2026-03#INC#b",
    }));

    expect(result.statusCode).toBe(409);
  });

  it("rejects self-links", async () => {
    const { handler } = await import("../../src/links/create-link.js");

    const result = await handler(makeEvent({
      parentSk: "TRANS#2026-03#EXP#a",
      childSk: "TRANS#2026-03#EXP#a",
    }));

    expect(result.statusCode).toBe(400);
  });
});
