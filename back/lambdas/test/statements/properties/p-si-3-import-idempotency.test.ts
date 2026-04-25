// Feature: statement-import, Property 3: Import idempotency via deterministic importHash
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { buildImportHash } from '../../../src/statements/services/import-hash.js';
import { extractedTxArb } from './arbitraries.js';

describe('P-SI-3 import idempotency', () => {
  it('buildImportHash is deterministic for a given (userId, row) input', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 32 }),
        extractedTxArb,
        (userId, tx) => {
          const a = buildImportHash(userId, tx);
          const b = buildImportHash(userId, tx);
          return a === b && /^[0-9a-f]{64}$/.test(a);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different users produce different hashes for the same row', () => {
    fc.assert(
      fc.property(extractedTxArb, (tx) => {
        const u1 = buildImportHash('user-1', tx);
        const u2 = buildImportHash('user-2', tx);
        return u1 !== u2;
      }),
      { numRuns: 100 },
    );
  });

  it('source is normalized so whitespace/case variations collide', () => {
    fc.assert(
      fc.property(extractedTxArb, (tx) => {
        const base = buildImportHash('u', tx);
        const noisy = buildImportHash('u', {
          ...tx,
          source: `  ${tx.source.toUpperCase()}  `,
        });
        return base === noisy;
      }),
      { numRuns: 100 },
    );
  });
});
