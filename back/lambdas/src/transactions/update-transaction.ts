import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { UpdateTransactionSchema } from "./schemas";
import { extractUserId, errorResponse, successResponse, parseJsonBody, decodeSk } from "./utils";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = extractUserId(event);

    if (!userId) {
      return errorResponse(401, "Unauthorized");
    }

    const sk = event.pathParameters?.sk;

    if (!sk) {
      return errorResponse(400, "Missing transaction key");
    }

    const decodedSk = decodeSk(sk);

    const rawBody = parseJsonBody(event.body);
    if (rawBody === null) {
      return errorResponse(400, "Invalid request body");
    }

    const parsed = UpdateTransactionSchema.safeParse(rawBody);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return errorResponse(400, "Validation failed", errors);
    }

    const { description, amount, date, type, source, category } = parsed.data;

    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: decodedSk,
      },
      ConditionExpression: "attribute_exists(pk)",
      UpdateExpression: "SET description = :description, amount = :amount, #date = :date, #type = :type, #source = :source, category = :category",
      ExpressionAttributeNames: {
        "#date": "date",
        "#type": "type",
        "#source": "source",
      },
      ExpressionAttributeValues: {
        ":description": description,
        ":amount": amount,
        ":date": date,
        ":type": type,
        ":source": source,
        ":category": category,
      },
      ReturnValues: "ALL_NEW",
    }));

    return successResponse(200, result.Attributes as Record<string, unknown>);
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return errorResponse(404, "Transaction not found");
    }
    console.error(error);
    return errorResponse(500, "Internal server error");
  }
};
