// Feature: statement-import, Property 5: Link count equals accepted-candidate child count
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { buildLinkSk } from '../../../src/links/link-utils.js';

/**
 * Linkage is keyed deterministically by `LINK#<encodedParent>#<encodedChild>`.
 * This property demonstrates that, given a fixed parent and N distinct child
 * SKs, exactly N unique link SKs are produced — and re-running the build is
 * idempotent (the second run produces the same set, not additional items),
 * which is how `confirm-statement-import` stays idempotent across re-imports.
 */
describe('P-SI-5 link count', () => {
  it('N distinct children → N unique link SKs (idempotent across re-runs)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^TRANS#2026-\d{2}#(INC|EXP)#c-\d{1,4}$/), {
          minLength: 1,
          maxLength: 50,
        }),
        fc.stringMatching(/^TRANS#2026-\d{2}#EXP#p-\d{1,4}$/),
        (children, parent) => {
          const first = new Set(children.map((c) => buildLinkSk(parent, c)));
          const second = new Set(children.map((c) => buildLinkSk(parent, c)));
          const union = new Set([...first, ...second]);
          return (
            first.size === children.length &&
            second.size === children.length &&
            union.size === children.length
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
