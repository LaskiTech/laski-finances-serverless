import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, withAuth, errorResponse, successResponse } from "../shared/utils";

const LINKS_TABLE_NAME = process.env.LINKS_TABLE_NAME!;

export const handler = withAuth(async (event, userId, logger) => {
  const linkId = event.pathParameters?.linkId;
  if (!linkId) {
    return errorResponse(400, "Missing link ID");
  }

  const pk = `USER#${userId}`;

  // Find the link by linkId using GSI_LinksById
  const queryResult = await docClient.send(new QueryCommand({
    TableName: LINKS_TABLE_NAME,
    IndexName: "GSI_LinksById",
    KeyConditionExpression: "pk = :pk AND linkId = :linkId",
    ExpressionAttributeValues: {
      ":pk": pk,
      ":linkId": linkId,
    },
  }));

  const items = queryResult.Items ?? [];
  if (items.length === 0) {
    return errorResponse(404, "Link not found");
  }

  const link = items[0];

  await docClient.send(new DeleteCommand({
    TableName: LINKS_TABLE_NAME,
    Key: { pk: link.pk, sk: link.sk },
  }));

  logger.info("Link deleted", { linkId });
  return successResponse(200, { message: "Link deleted" });
});
