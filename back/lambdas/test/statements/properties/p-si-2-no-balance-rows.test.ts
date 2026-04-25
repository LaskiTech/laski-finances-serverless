// Feature: statement-import, Property 2: No balance rows leak into extractedTransactions
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { parseBankAccountText } from '../../../src/statements/parsers/itau-bank-account.js';
import { syntheticBankStmtArb } from './arbitraries.js';

describe('P-SI-2 no balance rows', () => {
  it('parsed descriptions never start with SALDO ...', () => {
    fc.assert(
      fc.property(syntheticBankStmtArb, (stmt) => {
        const result = parseBankAccountText(stmt.text);
        return result.extractedTransactions.every(
          (t) => !t.description.toUpperCase().startsWith('SALDO'),
        );
      }),
      { numRuns: 100 },
    );
  });
});
