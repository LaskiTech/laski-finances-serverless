import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send: mockSend })),
    },
    UpdateCommand: vi.fn((input: unknown) => ({ _type: "UpdateCommand", input })),
  };
});

describe("updateMonthlySummary", () => {
  beforeEach(() => {
    vi.stubEnv("SUMMARY_TABLE_NAME", "laskifin-MonthlySummary");
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
  });

  it("adds to totalIncome for INC type with add operation", async () => {
    const { updateMonthlySummary } = await import(
      "../../src/shared/update-monthly-summary.js"
    );
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    const client = DynamoDBDocumentClient.from({} as never);

    await updateMonthlySummary(client, "USER#abc", "2026-03-15", 500, "INC", "add");

    expect(mockSend).toHaveBeenCalledTimes(1);
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ pk: "USER#abc", sk: "SUMMARY#2026-03" });
    expect(cmd.input.ExpressionAttributeNames["#field"]).toBe("totalIncome");
    expect(cmd.input.ExpressionAttributeValues[":delta"]).toBe(500);
    expect(cmd.input.ExpressionAttributeValues[":countDelta"]).toBe(1);
  });

  it("adds to totalExpenses for EXP type with add operation", async () => {
    const { updateMonthlySummary } = await import(
      "../../src/shared/update-monthly-summary.js"
    );
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    const client = DynamoDBDocumentClient.from({} as never);

    await updateMonthlySummary(client, "USER#abc", "2026-06-01", 200, "EXP", "add");

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeNames["#field"]).toBe("totalExpenses");
    expect(cmd.input.ExpressionAttributeValues[":delta"]).toBe(200);
  });

  it("subtracts from totalIncome for INC type with subtract operation", async () => {
    const { updateMonthlySummary } = await import(
      "../../src/shared/update-monthly-summary.js"
    );
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    const client = DynamoDBDocumentClient.from({} as never);

    await updateMonthlySummary(client, "USER#abc", "2026-03-15", 300, "INC", "subtract");

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":delta"]).toBe(-300);
    expect(cmd.input.ExpressionAttributeValues[":countDelta"]).toBe(-1);
  });

  it("targets correct month from ISO date string", async () => {
    const { updateMonthlySummary } = await import(
      "../../src/shared/update-monthly-summary.js"
    );
    const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
    const client = DynamoDBDocumentClient.from({} as never);

    await updateMonthlySummary(client, "USER#abc", "2026-12-25T10:00:00Z", 100, "EXP", "add");

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Key.sk).toBe("SUMMARY#2026-12");
  });
});
