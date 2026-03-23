import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { CreateTransactionSchema } from "./schemas";
import { extractUserId, errorResponse, successResponse, parseJsonBody } from "./utils";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = extractUserId(event);

    if (!userId) {
      return errorResponse(401, "Unauthorized");
    }

    const rawBody = parseJsonBody(event.body);
    if (rawBody === null) {
      return errorResponse(400, "Invalid request body");
    }

    // Validate input with Zod
    const parsed = CreateTransactionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return errorResponse(400, "Validation failed", errors);
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

    return successResponse(201, { message: "Transaction(s) created successfully" });
  } catch (error) {
    console.error(error);
    return errorResponse(500, "Internal server error");
  }
};
