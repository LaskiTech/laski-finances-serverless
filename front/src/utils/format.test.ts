import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate } from './format';

describe('formatCurrency', () => {
  it('formats a simple amount as BRL', () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain('R$');
    expect(result).toContain('1.234,56');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('R$');
    expect(result).toContain('0,00');
  });

  it('formats negative amounts', () => {
    const result = formatCurrency(-50.5);
    expect(result).toContain('R$');
    expect(result).toContain('50,50');
  });
});

describe('formatDate', () => {
  it('formats an ISO date string as DD/MM/YYYY', () => {
    expect(formatDate('2024-06-15')).toBe('15/06/2024');
  });

  it('formats a full ISO datetime string', () => {
    expect(formatDate('2024-01-03T10:30:00Z')).toBe('03/01/2024');
  });

  it('pads single-digit day and month', () => {
    expect(formatDate('2023-02-05')).toBe('05/02/2023');
  });
});
