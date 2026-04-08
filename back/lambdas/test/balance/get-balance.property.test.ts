import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const { mockSend } = vi.hoisted(() => {
  const mockSend = vi.fn();
  return { mockSend };
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  GetCommand: vi.fn((input: unknown) => ({ _type: 'GetCommand', input })),
  QueryCommand: vi.fn((input: unknown) => ({ _type: 'QueryCommand', input })),
}));

import { handler } from '../../src/balance/get-balance';

function makeEvent(
  queryStringParameters: Record<string, string> | null = null,
  sub: string | null = 'user-123',
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    body: null,
    pathParameters: null,
    queryStringParameters,
    requestContext: {
      requestId: 'req-1',
      authorizer: sub ? { claims: { sub } } : undefined,
    } as unknown as APIGatewayProxyEvent['requestContext'],
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    path: '/balance',
    resource: '/balance',
    stageVariables: null,
    multiValueQueryStringParameters: null,
  } as APIGatewayProxyEvent;
}

// --- Generators ---

/** Generates a valid YYYY-MM string */
const validYearMonth = fc
  .tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 1, max: 12 }))
  .map(([y, m]) => `${y}-${String(m).padStart(2, '0')}`);

/** Computes the number of months between two YYYY-MM strings (inclusive) */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** Adds N months to a YYYY-MM string */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const totalMonths = (y * 12 + m - 1) + n;
  const newY = Math.floor(totalMonths / 12);
  const newM = (totalMonths % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}

/** Enumerates all YYYY-MM from `from` to `to` inclusive */
function enumerateMonths(from: string, to: string): string[] {
  const months: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

describe('get-balance handler — Property Tests', () => {
  beforeEach(() => {
    vi.stubEnv('SUMMARY_TABLE_NAME', 'laskifin-MonthlySummary');
    vi.stubEnv('CORS_ORIGIN', '*');
    mockSend.mockReset();
  });

  // Feature: balance-overview, Property 1: Balance is always recomputed, never read from stored attribute
  it('Property 1: balance is always totalIncome - totalExpenses, ignoring stored balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        validYearMonth,
        fc.float({ min: 0, max: 1_000_000, noNaN: true }),
        fc.float({ min: 0, max: 1_000_000, noNaN: true }),
        fc.float({ min: -999_999, max: 999_999, noNaN: true }),
        fc.integer({ min: 0, max: 1000 }),
        async (month, totalIncome, totalExpenses, storedBalance, transactionCount) => {
          mockSend.mockReset();
          mockSend.mockResolvedValueOnce({
            Item: {
              pk: 'USER#user-123',
              sk: `SUMMARY#${month}`,
              totalIncome,
              totalExpenses,
              balance: storedBalance, // deliberately wrong stored balance
              transactionCount,
            },
          });

          const result = await handler(makeEvent({ month }));
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          expect(body.balance).toBe(totalIncome - totalExpenses);
          // The stored balance value should never appear if it differs
          expect(body.totalIncome).toBe(totalIncome);
          expect(body.totalExpenses).toBe(totalExpenses);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 2: Empty month returns zero-valued HTTP 200, not 404
  it('Property 2: empty month returns HTTP 200 with all zeros', async () => {
    await fc.assert(
      fc.asyncProperty(validYearMonth, async (month) => {
        mockSend.mockReset();
        mockSend.mockResolvedValueOnce({ Item: undefined });

        const result = await handler(makeEvent({ month }));
        expect(result.statusCode).toBe(200);

        const body = JSON.parse(result.body);
        expect(body).toEqual({
          month,
          totalIncome: 0,
          totalExpenses: 0,
          balance: 0,
          transactionCount: 0,
        });
      }),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 3: Range response contains exactly the right number of months
  it('Property 3: range months array has exactly N entries sorted ascending', async () => {
    await fc.assert(
      fc.asyncProperty(
        validYearMonth,
        fc.integer({ min: 1, max: 24 }),
        async (from, rangeSize) => {
          const to = addMonths(from, rangeSize - 1);
          // Ensure `to` is still a valid year
          if (parseInt(to.split('-')[0]) > 2099) return;

          mockSend.mockReset();
          mockSend.mockResolvedValueOnce({ Items: [] });

          const result = await handler(makeEvent({ from, to }));
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          expect(body.months).toHaveLength(rangeSize);

          // Verify ascending order
          for (let i = 1; i < body.months.length; i++) {
            expect(body.months[i].month > body.months[i - 1].month).toBe(true);
          }

          // Verify all months are within [from, to]
          for (const entry of body.months) {
            expect(entry.month >= from).toBe(true);
            expect(entry.month <= to).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 4: Empty months are zero-filled in range responses
  it('Property 4: missing months in range are zero-filled', async () => {
    await fc.assert(
      fc.asyncProperty(
        validYearMonth,
        fc.integer({ min: 2, max: 12 }),
        async (from, rangeSize) => {
          const to = addMonths(from, rangeSize - 1);
          if (parseInt(to.split('-')[0]) > 2099) return;

          const allMonths = enumerateMonths(from, to);
          // Only provide data for the first month — rest should be zero-filled
          const sparseItems = [
            {
              sk: `SUMMARY#${allMonths[0]}`,
              totalIncome: 1000,
              totalExpenses: 500,
              transactionCount: 5,
            },
          ];

          mockSend.mockReset();
          mockSend.mockResolvedValueOnce({ Items: sparseItems });

          const result = await handler(makeEvent({ from, to }));
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          expect(body.months).toHaveLength(rangeSize);

          // First month has data
          expect(body.months[0].totalIncome).toBe(1000);
          expect(body.months[0].totalExpenses).toBe(500);

          // All other months are zero-filled
          for (let i = 1; i < body.months.length; i++) {
            expect(body.months[i].totalIncome).toBe(0);
            expect(body.months[i].totalExpenses).toBe(0);
            expect(body.months[i].balance).toBe(0);
            expect(body.months[i].transactionCount).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 5: Range totals equal the sum of month values
  it('Property 5: totals equal sum of month values', async () => {
    const monthSummaryArb = fc.record({
      totalIncome: fc.float({ min: 0, max: 100_000, noNaN: true }),
      totalExpenses: fc.float({ min: 0, max: 100_000, noNaN: true }),
      transactionCount: fc.integer({ min: 0, max: 100 }),
    });

    await fc.assert(
      fc.asyncProperty(
        validYearMonth,
        fc.integer({ min: 1, max: 12 }),
        fc.array(monthSummaryArb, { minLength: 1, maxLength: 12 }),
        async (from, rangeSize, summaries) => {
          const to = addMonths(from, rangeSize - 1);
          if (parseInt(to.split('-')[0]) > 2099) return;

          const allMonths = enumerateMonths(from, to);
          // Build DynamoDB items for as many months as we have summaries (up to rangeSize)
          const items = allMonths.slice(0, Math.min(summaries.length, rangeSize)).map((month, i) => ({
            sk: `SUMMARY#${month}`,
            totalIncome: summaries[i].totalIncome,
            totalExpenses: summaries[i].totalExpenses,
            transactionCount: summaries[i].transactionCount,
          }));

          mockSend.mockReset();
          mockSend.mockResolvedValueOnce({ Items: items });

          const result = await handler(makeEvent({ from, to }));
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);

          // Sum up all month values from the response
          let expectedIncome = 0;
          let expectedExpenses = 0;
          for (const m of body.months) {
            expectedIncome += m.totalIncome;
            expectedExpenses += m.totalExpenses;
          }

          expect(body.totals.totalIncome).toBeCloseTo(expectedIncome, 5);
          expect(body.totals.totalExpenses).toBeCloseTo(expectedExpenses, 5);
          expect(body.totals.balance).toBeCloseTo(
            body.totals.totalIncome - body.totals.totalExpenses,
            5,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 6: `month` and `from`/`to` are mutually exclusive
  it('Property 6: month + from/to together returns HTTP 400', async () => {
    await fc.assert(
      fc.asyncProperty(
        validYearMonth,
        validYearMonth,
        fc.option(validYearMonth),
        async (month, from, maybeTo) => {
          mockSend.mockReset();

          // Always include `month` and at least `from`
          const params: Record<string, string> = { month, from };
          if (maybeTo !== null) {
            params.to = maybeTo;
          }

          const result = await handler(makeEvent(params));
          expect(result.statusCode).toBe(400);

          const body = JSON.parse(result.body);
          expect(body.error).toContain('mutually exclusive');
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 7: Range cap is enforced before any DynamoDB call
  it('Property 7: range > 24 months returns HTTP 400 with no DynamoDB call', async () => {
    await fc.assert(
      fc.asyncProperty(
        validYearMonth,
        fc.integer({ min: 25, max: 120 }),
        async (from, rangeSize) => {
          const to = addMonths(from, rangeSize - 1);
          if (parseInt(to.split('-')[0]) > 2099) return;

          mockSend.mockReset();

          const result = await handler(makeEvent({ from, to }));
          expect(result.statusCode).toBe(400);

          const body = JSON.parse(result.body);
          expect(body.error).toContain('24 months');

          // No DynamoDB call should have been made
          expect(mockSend).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 8: `from` after `to` is rejected
  it('Property 8: from > to returns HTTP 400', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(validYearMonth, validYearMonth).filter(([a, b]) => a > b),
        async ([from, to]) => {
          mockSend.mockReset();

          const result = await handler(makeEvent({ from, to }));
          expect(result.statusCode).toBe(400);

          const body = JSON.parse(result.body);
          expect(body.error).toContain('from must not be after to');
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 9: Invalid YYYY-MM values are rejected
  it('Property 9: invalid YYYY-MM values return HTTP 400', async () => {
    const invalidYearMonth = fc.oneof(
      // Random strings that don't match YYYY-MM
      fc.string({ minLength: 0, maxLength: 20 }).filter(
        (s) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(s),
      ),
      // Month out of range
      fc.tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 13, max: 99 })).map(
        ([y, m]) => `${y}-${String(m).padStart(2, '0')}`,
      ),
      // Month 00
      fc.integer({ min: 2000, max: 2099 }).map((y) => `${y}-00`),
    );

    await fc.assert(
      fc.asyncProperty(invalidYearMonth, async (invalidMonth) => {
        mockSend.mockReset();

        // Test as single month param
        const result = await handler(makeEvent({ month: invalidMonth }));
        expect(result.statusCode).toBe(400);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: balance-overview, Property 10: No-params defaults to current UTC month
  it('Property 10: no params returns month matching current UTC YYYY-MM', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.integer({ min: 2000, max: 2099 }),
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
        ),
        async ([year, month, day, hour, minute]) => {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
          const expectedMonth = `${year}-${String(month).padStart(2, '0')}`;

          vi.useFakeTimers();
          vi.setSystemTime(new Date(dateStr));

          mockSend.mockReset();
          mockSend.mockResolvedValueOnce({ Item: undefined });

          const result = await handler(makeEvent());
          expect(result.statusCode).toBe(200);

          const body = JSON.parse(result.body);
          expect(body.month).toBe(expectedMonth);

          vi.useRealTimers();
        },
      ),
      { numRuns: 100 },
    );
  });
});
