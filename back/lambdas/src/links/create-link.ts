import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { CreateLinkSchema } from "./schemas";
import { buildLinkSk, buildLinkId } from "./link-utils";
import { docClient, withAuth, errorResponse, successResponse, parseJsonBody } from "../shared/utils";

const TABLE_NAME = process.env.TABLE_NAME!;
const LINKS_TABLE_NAME = process.env.LINKS_TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
  const rawBody = parseJsonBody(event.body);
  if (rawBody === null) {
    return errorResponse(400, "Invalid request body");
  }

  const parsed = CreateLinkSchema.safeParse(rawBody);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return errorResponse(400, "Validation failed", errors);
  }

  const { parentSk, childSk } = parsed.data;
  const pk = `USER#${userId}`;

  // Verify both entries exist in Ledger
  const [parentResult, childResult] = await Promise.all([
    docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: parentSk },
    })),
    docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: childSk },
    })),
  ]);

  if (!parentResult.Item) {
    return errorResponse(404, "Parent entry not found");
  }
  if (!childResult.Item) {
    return errorResponse(404, "Child entry not found");
  }

  const sk = buildLinkSk(parentSk, childSk);
  const linkId = buildLinkId(sk);
  const createdAt = new Date().toISOString();

  try {
    await docClient.send(new PutCommand({
      TableName: LINKS_TABLE_NAME,
      Item: {
        pk,
        sk,
        linkId,
        parentSk,
        childSk,
        createdAt,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }));

    logger.info("Link created", { linkId, parentSk, childSk });
    return successResponse(201, { linkId, parentSk, childSk, createdAt });
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return errorResponse(409, "Link already exists");
    }
    logger.error("Create link failed", error);
    throw error;
  }
});
