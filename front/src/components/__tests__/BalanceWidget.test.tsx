import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { BalanceWidget } from '../BalanceWidget';
import type { SingleMonthResponse, RangeResponse } from '../../api/balance';

// --- Helpers ---

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function makeSingleResponse(overrides: Partial<SingleMonthResponse> = {}): SingleMonthResponse {
  return {
    month: currentYearMonth(),
    totalIncome: 5000,
    totalExpenses: 3200,
    balance: 1800,
    transactionCount: 24,
    ...overrides,
  };
}

function makeRangeResponse(): RangeResponse {
  return {
    from: '2024-01',
    to: '2024-03',
    months: [
      { month: '2024-01', totalIncome: 5000, totalExpenses: 2800, balance: 2200, transactionCount: 20 },
      { month: '2024-02', totalIncome: 5000, totalExpenses: 3100, balance: 1900, transactionCount: 22 },
      { month: '2024-03', totalIncome: 0, totalExpenses: 0, balance: 0, transactionCount: 0 },
    ],
    totals: { totalIncome: 10000, totalExpenses: 5900, balance: 4100 },
  };
}

/**
 * Flexible text matcher that handles locale-dependent whitespace in BRL formatting.
 * jsdom may render "R$\u00A05.000,00" or "R$ 5.000,00" depending on the ICU data.
 */
function brl(text: string): (content: string, element: Element | null) => boolean {
  const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const expected = normalise(text);
  return (_content, element) => {
    if (!element) return false;
    return normalise(element.textContent ?? '') === expected;
  };
}

interface RenderOpts {
  mode?: 'single' | 'range';
  isLoading?: boolean;
  error?: string | null;
  singleData?: SingleMonthResponse | null;
  rangeData?: RangeResponse | null;
  onRetry?: () => void;
}

function renderWidget(opts: RenderOpts = {}): ReturnType<typeof render> {
  const {
    mode = 'single',
    isLoading = false,
    error = null,
    singleData = null,
    rangeData = null,
    onRetry = vi.fn(),
  } = opts;

  return render(
    <ChakraProvider value={defaultSystem}>
      <BalanceWidget
        mode={mode}
        isLoading={isLoading}
        error={error}
        singleData={singleData}
        rangeData={rangeData}
        onRetry={onRetry}
      />
    </ChakraProvider>,
  );
}

// --- Tests ---

describe('BalanceWidget', () => {
  // Requirement 3.5 — loading skeleton on mount
  it('shows loading skeletons when isLoading is true (single mode)', () => {
    renderWidget({ isLoading: true });
    const skeletons = document.querySelectorAll('.chakra-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows loading skeleton when isLoading is true (range mode)', () => {
    renderWidget({ mode: 'range', isLoading: true });
    const skeletons = document.querySelectorAll('.chakra-skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  // Requirement 3.3 — three metric cards with data
  it('renders income, expenses, and balance when singleData is provided', () => {
    renderWidget({ singleData: makeSingleResponse() });

    expect(screen.getByText(brl('R$ 5.000,00'))).toBeInTheDocument();
    expect(screen.getByText(brl('R$ 3.200,00'))).toBeInTheDocument();
    expect(screen.getByText(brl('R$ 1.800,00'))).toBeInTheDocument();
    expect(screen.getByText(/income/i)).toBeInTheDocument();
    expect(screen.getByText(/expenses/i)).toBeInTheDocument();
    expect(screen.getAllByText(/balance/i).length).toBeGreaterThanOrEqual(1);
  });

  // Requirement 3.4 — balance green when >= 0
  it('renders balance in green when balance >= 0', () => {
    renderWidget({ singleData: makeSingleResponse({ balance: 1800 }) });
    const balanceValue = screen.getByText(brl('R$ 1.800,00'));
    expect(balanceValue).toHaveStyle({ color: '#16A34A' });
  });

  // Requirement 3.4 — balance red when < 0
  it('renders balance in red when balance < 0', () => {
    renderWidget({ singleData: makeSingleResponse({ balance: -500, totalExpenses: 5500 }) });
    const balanceValue = screen.getByText(brl('-R$ 500,00'));
    expect(balanceValue).toHaveStyle({ color: '#DC2626' });
  });

  // "View range" button is not rendered inside the widget (it lives in DashboardPage header)
  it('does not render a "View range" button in single mode', () => {
    renderWidget({ singleData: makeSingleResponse() });
    expect(screen.queryByText('View range')).not.toBeInTheDocument();
  });

  it('does not render a "View range" button in range mode', () => {
    renderWidget({ mode: 'range', rangeData: makeRangeResponse() });
    expect(screen.queryByText('View range')).not.toBeInTheDocument();
  });

  // Requirement 3.6 — API error renders Alert with retry button
  it('shows error alert with retry button when error is set', () => {
    renderWidget({ error: 'Network error' });
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  // Retry button calls onRetry
  it('calls onRetry when Retry button is clicked', async () => {
    const onRetry = vi.fn();
    renderWidget({ error: 'Network error', onRetry });
    await userEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  // Requirement 1.6 / 3.3 — zero values
  it('renders R$ 0,00 values for an empty month', () => {
    renderWidget({
      singleData: makeSingleResponse({ totalIncome: 0, totalExpenses: 0, balance: 0, transactionCount: 0 }),
    });
    const zeroValues = screen.getAllByText(brl('R$ 0,00'));
    expect(zeroValues.length).toBe(3); // income, expenses, balance
  });

  // Requirement 4.3 — range table with totals row
  it('renders range table with totals row when rangeData is provided', () => {
    renderWidget({ mode: 'range', rangeData: makeRangeResponse() });

    expect(screen.getByText('Total')).toBeInTheDocument();

    const tfoot = document.querySelector('tfoot');
    expect(tfoot).not.toBeNull();
    const totalsRow = within(tfoot!).getByText('Total');
    expect(totalsRow).toBeInTheDocument();
  });
});
