import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { ReviewTable } from '../statements/ReviewTable';
import type { ExtractedTransaction, ExtractedInstallmentPreview } from '../../api/statements';

function makeRow(overrides: Partial<ExtractedTransaction> = {}): ExtractedTransaction {
  return {
    date: '2026-04-01',
    description: 'Pagamento de energia',
    amount: 200,
    type: 'EXP',
    source: 'itau-corrente',
    category: 'utilities',
    ...overrides,
  };
}

function makeFutureRow(overrides: Partial<ExtractedInstallmentPreview> = {}): ExtractedInstallmentPreview {
  return {
    date: '2026-05-01',
    description: 'SAMSUNG 2/10',
    amount: 450,
    source: 'itau-black-1509',
    category: 'eletrônicos',
    installmentNumber: 2,
    installmentTotal: 10,
    groupId: 'group-1',
    ...overrides,
  };
}

function renderTable(
  drafts: ExtractedTransaction[] | undefined,
  selected: Set<number>,
  duplicates: Set<number>,
  onToggle = vi.fn(),
  futureInstallments?: ExtractedInstallmentPreview[],
): ReturnType<typeof render> {
  return render(
    <ChakraProvider value={defaultSystem}>
      <ReviewTable
        drafts={drafts}
        selected={selected}
        duplicateIndices={duplicates}
        onToggle={onToggle}
        futureInstallments={futureInstallments}
      />
    </ChakraProvider>,
  );
}

describe('ReviewTable', () => {
  it('renders a row for each draft transaction', () => {
    renderTable(
      [makeRow({ description: 'PIX TRANSF A' }), makeRow({ description: 'PIX TRANSF B' })],
      new Set([0, 1]),
      new Set(),
    );
    expect(screen.getByText('PIX TRANSF A')).toBeInTheDocument();
    expect(screen.getByText('PIX TRANSF B')).toBeInTheDocument();
  });

  it('renders nothing when drafts is undefined', () => {
    renderTable(undefined, new Set(), new Set());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('calls onToggle with the row index when a checkbox is changed', async () => {
    const onToggle = vi.fn();
    renderTable([makeRow()], new Set([0]), new Set(), onToggle);
    const checkboxes = screen.getAllByRole('checkbox');
    await userEvent.click(checkboxes[0]);
    expect(onToggle).toHaveBeenCalledWith(0);
  });

  it('renders duplicate label on duplicate rows', () => {
    renderTable([makeRow({ description: 'REPETIDA' })], new Set(), new Set([0]));
    expect(screen.getByText('REPETIDA')).toBeInTheDocument();
    expect(screen.getByText('(duplicata)')).toBeInTheDocument();
  });

  it('does not render duplicate label for non-duplicate rows', () => {
    renderTable([makeRow()], new Set([0]), new Set());
    expect(screen.queryByText('(duplicata)')).not.toBeInTheDocument();
  });

  it('renders the category value in an editable cell', () => {
    renderTable([makeRow({ category: 'alimentação' })], new Set([0]), new Set());
    expect(screen.getByText('alimentação')).toBeInTheDocument();
  });

  it('renders the source value in an editable cell', () => {
    renderTable([makeRow({ source: 'itau-corrente-9670' })], new Set([0]), new Set());
    expect(screen.getByText('itau-corrente-9670')).toBeInTheDocument();
  });

  it('renders category as an editable input when preview is clicked', async () => {
    renderTable([makeRow({ category: 'utilities' })], new Set([0]), new Set());
    const preview = screen.getByText('utilities');
    await userEvent.click(preview);
    const input = screen.getByLabelText('categoria linha 0');
    expect(input).toBeInTheDocument();
  });

  it('renders source as an editable input when preview is clicked', async () => {
    renderTable([makeRow({ source: 'itau-corrente' })], new Set([0]), new Set());
    const preview = screen.getByText('itau-corrente');
    await userEvent.click(preview);
    const input = screen.getByLabelText('fonte linha 0');
    expect(input).toBeInTheDocument();
  });

  it('renders future installments section header when futureInstallments is provided', () => {
    renderTable(
      [makeRow()],
      new Set([0]),
      new Set(),
      vi.fn(),
      [makeFutureRow({ description: 'SAMSUNG 2/10' })],
    );
    expect(screen.getByText(/próximas parcelas/i)).toBeInTheDocument();
    expect(screen.getByText('SAMSUNG 2/10')).toBeInTheDocument();
  });

  it('does not render future installments section when array is empty', () => {
    renderTable([makeRow()], new Set([0]), new Set(), vi.fn(), []);
    expect(screen.queryByText(/próximas parcelas/i)).not.toBeInTheDocument();
  });

  it('future installment rows are read-only — no checkboxes for them', () => {
    renderTable(
      [makeRow()],
      new Set([0]),
      new Set(),
      vi.fn(),
      [makeFutureRow(), makeFutureRow()],
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(1);
  });

  it('renders both date and amount for a row', () => {
    renderTable([makeRow({ date: '2026-04-20', amount: 1234.56 })], new Set([0]), new Set());
    expect(screen.getByText('2026-04-20')).toBeInTheDocument();
    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });
});
