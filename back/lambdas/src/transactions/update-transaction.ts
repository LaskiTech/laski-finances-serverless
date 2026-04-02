import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { UpdateTransactionSchema } from "./schemas";
import { docClient, withAuth, errorResponse, successResponse, parseJsonBody, decodeSk } from "./utils";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
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

  try {
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
    logger.error("Update failed", error);
    throw error; // re-throw so withAuth returns 500
  }
});
