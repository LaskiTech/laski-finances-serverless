import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, withAuth, errorResponse, successResponse } from "../shared/utils";

const TABLE_NAME = process.env.TABLE_NAME!;
const LINKS_TABLE_NAME = process.env.LINKS_TABLE_NAME!;

export const handler = withAuth(async (event, userId) => {
  const targetSk = event.queryStringParameters?.sk;
  if (!targetSk) {
    return errorResponse(400, "Missing 'sk' query parameter");
  }

  const pk = `USER#${userId}`;
  const encodedSk = encodeURIComponent(targetSk);

  // Query for links where targetSk is parent (main table, sk prefix)
  // and where targetSk is child (GSI_LinksByChild)
  const [asParentResult, asChildResult] = await Promise.all([
    docClient.send(new QueryCommand({
      TableName: LINKS_TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":skPrefix": `LINK#${encodedSk}#`,
      },
    })),
    docClient.send(new QueryCommand({
      TableName: LINKS_TABLE_NAME,
      IndexName: "GSI_LinksByChild",
      KeyConditionExpression: "pk = :pk AND childSk = :childSk",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":childSk": targetSk,
      },
    })),
  ]);

  const parentLinks = asParentResult.Items ?? [];
  const childLinks = asChildResult.Items ?? [];

  // Collect all counterpart SKs to batch-get from Ledger
  const counterpartSks = new Set<string>();
  for (const link of parentLinks) {
    counterpartSks.add(link.childSk as string);
  }
  for (const link of childLinks) {
    counterpartSks.add(link.parentSk as string);
  }

  // Batch get counterpart entries from Ledger (chunks of 100)
  const counterpartMap = new Map<string, Record<string, unknown>>();
  const skArray = Array.from(counterpartSks);

  for (let i = 0; i < skArray.length; i += 100) {
    const batch = skArray.slice(i, i + 100);
    const result = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: batch.map((sk) => ({ pk, sk })),
        },
      },
    }));

    for (const item of result.Responses?.[TABLE_NAME] ?? []) {
      counterpartMap.set(item.sk as string, item as Record<string, unknown>);
    }
  }

  // Enrich links with counterpart data, omit stale links
  const asParent = parentLinks
    .filter((link) => counterpartMap.has(link.childSk as string))
    .map((link) => ({
      linkId: link.linkId,
      parentSk: link.parentSk,
      childSk: link.childSk,
      createdAt: link.createdAt,
      counterpart: counterpartMap.get(link.childSk as string),
    }));

  const asChild = childLinks
    .filter((link) => counterpartMap.has(link.parentSk as string))
    .map((link) => ({
      linkId: link.linkId,
      parentSk: link.parentSk,
      childSk: link.childSk,
      createdAt: link.createdAt,
      counterpart: counterpartMap.get(link.parentSk as string),
    }));

  return successResponse(200, { asParent, asChild });
});
