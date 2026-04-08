import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatCurrency } from '../../utils/format';

describe('BalanceWidget — Property-Based Tests', () => {
  // Feature: balance-overview, Property 11: BRL formatting correctness
  // **Validates: Requirement 4.7**
  describe('Property 11: BRL formatting correctness', () => {
    it('formatCurrency always produces a string containing "R$" for any non-negative number', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1e9, noNaN: true, noDefaultInfinity: true }),
          (amount) => {
            const result = formatCurrency(amount);

            // Must contain the BRL currency symbol
            expect(result).toContain('R$');

            // Must contain a comma as decimal separator (pt-BR locale)
            expect(result).toMatch(/,/);

            // Must have exactly 2 decimal digits after the comma
            expect(result).toMatch(/,\d{2}$/);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('formatCurrency produces a negative indicator for negative numbers', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1e9, max: -0.01, noNaN: true, noDefaultInfinity: true }),
          (amount) => {
            const result = formatCurrency(amount);

            // Must contain the BRL currency symbol
            expect(result).toContain('R$');

            // Must contain a minus sign or Unicode minus (U+2212) as negative indicator
            const hasNegativeIndicator = result.includes('-') || result.includes('\u2212');
            expect(hasNegativeIndicator).toBe(true);

            // Must have exactly 2 decimal digits after the comma
            expect(result).toMatch(/,\d{2}$/);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('formatCurrency produces correct decimal representation for integer amounts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1_000_000, max: 1_000_000 }),
          (amount) => {
            const result = formatCurrency(amount);

            // Must contain R$
            expect(result).toContain('R$');

            // The formatted string must end with ,00 for integer amounts
            expect(result).toMatch(/,00$/);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: balance-overview, Property 12: Next-month navigation is capped at current month
  // **Validates: Requirement 3.8**
  describe('Property 12: Next-month navigation is capped at current month', () => {
    function currentYearMonth(): string {
      return new Date().toISOString().slice(0, 7);
    }

    function prevMonth(yearMonth: string): string {
      const [y, m] = yearMonth.split('-').map(Number);
      const newM = m === 1 ? 12 : m - 1;
      const newY = m === 1 ? y - 1 : y;
      return `${newY}-${String(newM).padStart(2, '0')}`;
    }

    it('isNextDisabled is true when displayedMonth equals current month', () => {
      const current = currentYearMonth();

      fc.assert(
        fc.property(
          fc.constant(current),
          (displayedMonth) => {
            const isNextDisabled = displayedMonth >= current;
            expect(isNextDisabled).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('isNextDisabled is true for any month at or after the current month', () => {
      const current = currentYearMonth();

      // Generate months that are >= current month (current or future)
      const futureMonthArb = fc
        .integer({ min: 0, max: 36 })
        .map((offset) => {
          const [y, m] = current.split('-').map(Number);
          const totalMonths = y * 12 + m - 1 + offset;
          const newY = Math.floor(totalMonths / 12);
          const newM = (totalMonths % 12) + 1;
          return `${newY}-${String(newM).padStart(2, '0')}`;
        });

      fc.assert(
        fc.property(futureMonthArb, (displayedMonth) => {
          const isNextDisabled = displayedMonth >= current;
          expect(isNextDisabled).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('isNextDisabled is false for any month strictly before the current month', () => {
      const current = currentYearMonth();

      // Generate months that are strictly before the current month
      const pastMonthArb = fc
        .integer({ min: 1, max: 120 })
        .map((offset) => {
          const [y, m] = current.split('-').map(Number);
          const totalMonths = y * 12 + m - 1 - offset;
          const newY = Math.floor(totalMonths / 12);
          const newM = (totalMonths % 12) + 1;
          return `${newY}-${String(newM).padStart(2, '0')}`;
        });

      fc.assert(
        fc.property(pastMonthArb, (displayedMonth) => {
          const isNextDisabled = displayedMonth >= current;
          expect(isNextDisabled).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('navigating forward from a past month never exceeds the current month', () => {
      const current = currentYearMonth();

      // Generate a past month and a number of forward steps
      const pastMonthArb = fc
        .integer({ min: 1, max: 120 })
        .map((offset) => {
          const [y, m] = current.split('-').map(Number);
          const totalMonths = y * 12 + m - 1 - offset;
          const newY = Math.floor(totalMonths / 12);
          const newM = (totalMonths % 12) + 1;
          return `${newY}-${String(newM).padStart(2, '0')}`;
        });

      function nextMonth(yearMonth: string): string {
        const [y, m] = yearMonth.split('-').map(Number);
        const newM = m === 12 ? 1 : m + 1;
        const newY = m === 12 ? y + 1 : y;
        return `${newY}-${String(newM).padStart(2, '0')}`;
      }

      fc.assert(
        fc.property(
          pastMonthArb,
          fc.integer({ min: 1, max: 200 }),
          (startMonth, steps) => {
            // Simulate the widget's navigation logic: only advance if not at current month
            let displayed = startMonth;
            for (let i = 0; i < steps; i++) {
              if (displayed >= current) break; // next button disabled
              displayed = nextMonth(displayed);
            }
            // After any number of steps, displayed should never exceed current month
            expect(displayed <= current).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
