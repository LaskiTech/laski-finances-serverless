import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  docClient,
  withAuth,
  errorResponse,
  successResponse,
} from "../shared/utils";

const SUMMARY_TABLE_NAME = process.env.SUMMARY_TABLE_NAME!;

// --- Types ---

interface SingleMonthQuery {
  mode: "single";
  month: string;
}

interface RangeQuery {
  mode: "range";
  from: string;
  to: string;
}

type BalanceQuery = SingleMonthQuery | RangeQuery;

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// --- Helpers ---

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function validateYearMonth(value: string, field: string): void {
  if (!YEAR_MONTH_RE.test(value)) {
    throw new ValidationError(`${field} must be a valid YYYY-MM string`);
  }
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function enumerateMonths(from: string, to: string): string[] {
  const months: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

// --- Parameter parsing ---

function parseAndValidateParams(
  params: Record<string, string | undefined>
): BalanceQuery {
  const { month, from, to } = params;

  if (month && (from || to)) {
    throw new ValidationError("month is mutually exclusive with from/to");
  }

  if ((from && !to) || (!from && to)) {
    throw new ValidationError(
      "Both from and to are required for range queries"
    );
  }

  if (from && to) {
    validateYearMonth(from, "from");
    validateYearMonth(to, "to");
    if (from > to) {
      throw new ValidationError("from must not be after to");
    }
    if (monthsBetween(from, to) > 24) {
      throw new ValidationError("Range must not exceed 24 months");
    }
    return { mode: "range", from, to };
  }

  const target = month ?? currentYearMonth();
  validateYearMonth(target, "month");
  return { mode: "single", month: target };
}

// --- Single-month query ---

async function getSingleMonth(
  userId: string,
  month: string
): Promise<Record<string, unknown>> {
  const result = await docClient.send(
    new GetCommand({
      TableName: SUMMARY_TABLE_NAME,
      Key: { pk: userId, sk: `SUMMARY#${month}` },
    })
  );

  const item = result.Item;
  const totalIncome = (item?.totalIncome as number | undefined) ?? 0;
  const totalExpenses = (item?.totalExpenses as number | undefined) ?? 0;
  const transactionCount =
    (item?.transactionCount as number | undefined) ?? 0;

  return {
    month,
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    transactionCount,
  };
}

// --- Range query ---

async function getRangeMonths(
  userId: string,
  from: string,
  to: string
): Promise<Record<string, unknown>> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: SUMMARY_TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :from AND :to",
      ExpressionAttributeValues: {
        ":pk": userId,
        ":from": `SUMMARY#${from}`,
        ":to": `SUMMARY#${to}`,
      },
      ScanIndexForward: true,
    })
  );

  const itemMap = new Map<string, Record<string, unknown>>();
  for (const item of result.Items ?? []) {
    itemMap.set(item.sk as string, item);
  }

  const months: Record<string, unknown>[] = [];
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const month of enumerateMonths(from, to)) {
    const item = itemMap.get(`SUMMARY#${month}`);
    const inc = (item?.totalIncome as number | undefined) ?? 0;
    const exp = (item?.totalExpenses as number | undefined) ?? 0;
    const cnt = (item?.transactionCount as number | undefined) ?? 0;

    months.push({
      month,
      totalIncome: inc,
      totalExpenses: exp,
      balance: inc - exp,
      transactionCount: cnt,
    });

    totalIncome += inc;
    totalExpenses += exp;
  }

  return {
    from,
    to,
    months,
    totals: {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
    },
  };
}

// --- Handler ---

export const handler = withAuth(async (event, userId, logger) => {
  try {
    const query = parseAndValidateParams(
      event.queryStringParameters ?? {}
    );

    const pk = `USER#${userId}`;

    if (query.mode === "single") {
      const data = await getSingleMonth(pk, query.month);
      logger.info("Single month balance retrieved", { month: query.month });
      return successResponse(200, data);
    }

    const data = await getRangeMonths(pk, query.from, query.to);
    logger.info("Range balance retrieved", {
      from: query.from,
      to: query.to,
    });
    return successResponse(200, data);
  } catch (err) {
    if (err instanceof ValidationError) {
      return errorResponse(400, err.message);
    }
    throw err;
  }
});
