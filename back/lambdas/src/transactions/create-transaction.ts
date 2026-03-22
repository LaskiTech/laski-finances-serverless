import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

// Zod schema for transaction input validation
const CreateTransactionSchema = z.object({
  description: z.string().min(1, "Description is required"),
  totalAmount: z.number().positive("Total amount must be positive"),
  installments: z.number().int().min(1, "Installments must be an integer >= 1").default(1),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  category: z.string().min(1, "Category is required"),
  source: z.string().min(1, "Source is required"),
  type: z.enum(["INC", "EXP"], { message: "Invalid transaction type. Must be INC or EXP" }),
});

type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(event.body || "");
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid request body" }),
      };
    }

    // Validate input with Zod
    const parsed = CreateTransactionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Validation failed", details: errors }),
      };
    }

    const { description, totalAmount, installments, date, category, source, type } = parsed.data;
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
