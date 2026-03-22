import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

// Valid transaction types: Income (INC) or Expense (EXP)
const VALID_TYPES = ["INC", "EXP"] as const;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body || "");
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request body" }),
      };
    }

    if (!body || typeof body !== "object") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request body" }),
      };
    }

    const { description, totalAmount, installments = 1, date, category, source, type } = body as {
      description: string;
      totalAmount: number;
      installments: number;
      date: string;
      category: string;
      source: string;
      type: string;
    };

    // Validate transaction type
    if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid transaction type. Must be INC or EXP" }),
      };
    }

    // Validate installments: must be an integer >= 1
    if (!Number.isInteger(installments) || installments < 1) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid installments value. Must be an integer >= 1" }),
      };
    }

    const transactionGroupId = uuidv4();

    for (let i = 0; i < installments; i++) {
      const installmentDate = new Date(date);
      installmentDate.setMonth(installmentDate.getMonth() + i);

      const yearMonth = installmentDate.toISOString().slice(0, 7); // YYYY-MM format
      const installmentAmount = totalAmount / installments;

      const item = {
        pk: `USER#${userId}`,
        sk: `TRANS#${yearMonth}#${type}#${uuidv4()}`,
        description: installments > 1 ? `${description} (${i + 1}/${installments})` : description,
        amount: installmentAmount,
        totalAmount,
        category,
        source,
        type,
        date: installmentDate.toISOString(),
        groupId: transactionGroupId,
        installmentNumber: i + 1,
        installmentTotal: installments,
      };

      // Note: In production, consider using BatchWriteItem for better performance
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }));
    }

    return {
      statusCode: 201,
      body: JSON.stringify({ message: "Transaction(s) created successfully" }),
    };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
