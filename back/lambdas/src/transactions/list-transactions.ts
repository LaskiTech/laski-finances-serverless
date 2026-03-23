import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { ListQuerySchema } from "./schemas";
import { extractUserId, errorResponse, successResponse } from "./utils";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = extractUserId(event);

    if (!userId) {
      return errorResponse(401, "Unauthorized");
    }

    const queryParams = event.queryStringParameters ?? {};
    const parsed = ListQuerySchema.safeParse(queryParams);

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => issue.message);
      return errorResponse(400, "Validation failed", errors);
    }

    const { month, type } = parsed.data;

    let skPrefix = "TRANS#";
    if (month) {
      skPrefix += `${month}#`;
      if (type) {
        skPrefix += `${type}#`;
      }
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userId}`,
          ":skPrefix": skPrefix,
        },
        ScanIndexForward: false,
      })
    );

    return successResponse(200, { transactions: result.Items ?? [] });
  } catch (error) {
    console.error(error);
    return errorResponse(500, "Internal server error");
  }
};
