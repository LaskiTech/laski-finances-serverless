import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  QueryCommand: vi.fn((input: unknown) => ({ _type: "QueryCommand", input })),
  DeleteCommand: vi.fn((input: unknown) => ({ _type: "DeleteCommand", input })),
}));

function makeEvent(linkId: string): APIGatewayProxyEvent {
  return {
    httpMethod: "DELETE",
    body: null,
    pathParameters: { linkId },
    queryStringParameters: null,
    requestContext: {
      requestId: "req-1",
      authorizer: { claims: { sub: "user-123" } },
    } as unknown as APIGatewayProxyEvent["requestContext"],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: `/links/${linkId}`,
    resource: "/links/{linkId}",
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

describe("delete-link handler", () => {
  beforeEach(() => {
    vi.stubEnv("TABLE_NAME", "laskifin-Ledger");
    vi.stubEnv("LINKS_TABLE_NAME", "laskifin-Links");
    vi.stubEnv("CORS_ORIGIN", "*");
    mockSend.mockReset();
  });

  it("deletes a link found by linkId", async () => {
    const { handler } = await import("../../src/links/delete-link.js");

    mockSend
      .mockResolvedValueOnce({ Items: [{ pk: "USER#user-123", sk: "LINK#a#b", linkId: "abc123" }] }) // QueryCommand (GSI)
      .mockResolvedValueOnce({}); // DeleteCommand

    const result = await handler(makeEvent("abc123"));
    expect(result.statusCode).toBe(200);

    const deleteCmd = mockSend.mock.calls[1][0];
    expect(deleteCmd._type).toBe("DeleteCommand");
    expect(deleteCmd.input.Key.sk).toBe("LINK#a#b");
  });

  it("returns 404 when link not found", async () => {
    const { handler } = await import("../../src/links/delete-link.js");

    mockSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent("nonexistent"));
    expect(result.statusCode).toBe(404);
  });
});
