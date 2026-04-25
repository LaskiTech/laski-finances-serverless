// Feature: statement-import, Property 4: Reconciliation exactness
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { reconcile } from '../../../src/statements/services/reconciliation.js';

describe('P-SI-4 reconciliation exactness', () => {
  it('exactly one ITAU BLACK match of matching total → one high-confidence candidate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100, max: 100_000 }),
        fc.stringMatching(/^2026-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-8])$/),
        async (cents, dueDate) => {
          const total = cents / 100;
          let callCount = 0;
          const mockClient = {
            send: async () => {
              callCount += 1;
              // Return the match on the first Query only; subsequent month
              // queries return no items. This preserves the "exactly one row
              // in the Ledger" invariant regardless of the ±3-day window
              // crossing month boundaries.
              if (callCount === 1) {
                return {
                  Items: [
                    {
                      sk: 'TRANS#2026-04#EXP#unique-match',
                      description: 'ITAU BLACK 3102-2305',
                      date: dueDate,
                      amount: total,
                    },
                  ],
                };
              }
              return { Items: [] };
            },
          };

          const candidates = await reconcile(
            {
              statementId: 'stmt-cc',
              documentType: 'CREDIT_CARD',
              pk: 'USER#u1',
            },
            { extractedTransactions: [], totalAmount: total, dueDate },
            {
              client: mockClient as never,
              ledgerTableName: 'L',
              statementsTableName: 'S',
            },
          );

          return (
            candidates.length === 1 &&
            candidates[0].confidence === 'high' &&
            candidates[0].parentSk === 'TRANS#2026-04#EXP#unique-match'
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
