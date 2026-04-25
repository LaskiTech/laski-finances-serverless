// Feature: statement-import, Property 1: Conservation of amount
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { parseCreditCardText } from '../../../src/statements/parsers/itau-credit-card.js';
import { syntheticBillArb } from './arbitraries.js';

describe('P-SI-1 conservation of amount', () => {
  it('sum(extractedTransactions.signedAmount) === totalDestaFatura', () => {
    fc.assert(
      fc.property(syntheticBillArb, (bill) => {
        const result = parseCreditCardText(bill.text);
        const sum = result.extractedTransactions.reduce(
          (acc, t) => acc + (t.type === 'EXP' ? t.amount : -t.amount),
          0,
        );
        return Math.abs(sum - bill.totalAmount) < 0.01;
      }),
      { numRuns: 100 },
    );
  });
});
