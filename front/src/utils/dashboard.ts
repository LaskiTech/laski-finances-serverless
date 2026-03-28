import type { TransactionItem } from '../api/transactions';

export interface CategoryTotal {
  category: string;
  total: number;
}

export interface BalanceSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
}

/**
 * Aggregates an array of EXP transactions by category.
 * Returns one entry per unique category, sorted by total descending.
 */
export function aggregateExpensesByCategory(transactions: TransactionItem[]): CategoryTotal[] {
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    const current = totals.get(tx.category) ?? 0;
    totals.set(tx.category, current + tx.amount);
  }

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Computes the net balance from an array of all transactions (INC + EXP).
 */
export function computeNetBalance(transactions: TransactionItem[]): BalanceSummary {
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of transactions) {
    if (tx.type === 'INC') {
      totalIncome += tx.amount;
    } else {
      totalExpenses += tx.amount;
    }
  }

  return {
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
  };
}

/**
 * Returns the current month in YYYY-MM format.
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns a color string based on the balance value.
 * Positive → "green", negative → "red", zero → "neutral".
 */
export function getBalanceColor(value: number): string {
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return 'neutral';
}
