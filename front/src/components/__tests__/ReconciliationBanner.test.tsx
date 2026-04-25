import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { ReconciliationBanner } from '../statements/ReconciliationBanner';
import type { ReconciliationCandidate } from '../../api/statements';

function makeCandidate(overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate {
  return {
    candidateId: 'cand-1',
    confidence: 'high',
    childStatementId: 'stmt-2',
    childCount: 97,
    totalAmount: 9181.49,
    dateWindow: { from: '2026-04-17', to: '2026-04-23' },
    ...overrides,
  };
}

function renderBanner(
  candidate: ReconciliationCandidate,
  accepted = false,
  onToggle = vi.fn(),
  chosenParent?: string,
  onChoose = vi.fn(),
): ReturnType<typeof render> {
  return render(
    <ChakraProvider value={defaultSystem}>
      <ReconciliationBanner
        candidate={candidate}
        accepted={accepted}
        onToggle={onToggle}
        chosenParent={chosenParent}
        onChoose={onChoose}
      />
    </ChakraProvider>,
  );
}

describe('ReconciliationBanner — high confidence', () => {
  it('renders child count in the banner text', () => {
    renderBanner(makeCandidate({ childCount: 97 }));
    expect(screen.getByText(/97 cobranças/i)).toBeInTheDocument();
  });

  it('renders parent description when provided', () => {
    renderBanner(makeCandidate({ parentDescription: 'ITAU BLACK 3102-2305' }));
    expect(screen.getByText(/ITAU BLACK 3102-2305/i)).toBeInTheDocument();
  });

  it('falls back to "transferência bancária" when parentDescription is absent', () => {
    renderBanner(makeCandidate({ parentDescription: undefined }));
    expect(screen.getByText(/transferência bancária/i)).toBeInTheDocument();
  });

  it('renders a checkbox unchecked when accepted is false', () => {
    renderBanner(makeCandidate(), false);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('renders a checkbox checked when accepted is true', () => {
    renderBanner(makeCandidate(), true);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls onToggle when the accept checkbox is clicked', async () => {
    const onToggle = vi.fn();
    renderBanner(makeCandidate(), false, onToggle);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('ReconciliationBanner — ambiguous confidence', () => {
  const parents = [
    { sk: 'sk-1', description: 'ITAU BLACK 1111', date: '2026-04-18' },
    { sk: 'sk-2', description: 'ITAU BLACK 2222', date: '2026-04-20' },
  ];

  it('renders one radio button per candidate parent', () => {
    renderBanner(makeCandidate({ confidence: 'ambiguous', candidateParents: parents }));
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('renders parent descriptions as radio labels', () => {
    renderBanner(makeCandidate({ confidence: 'ambiguous', candidateParents: parents }));
    expect(screen.getByText(/ITAU BLACK 1111/i)).toBeInTheDocument();
    expect(screen.getByText(/ITAU BLACK 2222/i)).toBeInTheDocument();
  });

  it('calls onChoose with the parent sk when a radio is selected', async () => {
    const onChoose = vi.fn();
    renderBanner(
      makeCandidate({ confidence: 'ambiguous', candidateParents: parents }),
      false,
      vi.fn(),
      undefined,
      onChoose,
    );
    const [firstRadio] = screen.getAllByRole('radio');
    await userEvent.click(firstRadio);
    expect(onChoose).toHaveBeenCalledWith('sk-1');
  });

  it('marks chosen parent radio as checked', () => {
    renderBanner(
      makeCandidate({ confidence: 'ambiguous', candidateParents: parents }),
      false,
      vi.fn(),
      'sk-2',
    );
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
  });

  it('does not render a checkbox for ambiguous confidence', () => {
    renderBanner(makeCandidate({ confidence: 'ambiguous', candidateParents: parents }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('ReconciliationBanner — none confidence', () => {
  it('renders "no corresponding bank payment" message', () => {
    renderBanner(makeCandidate({ confidence: 'none' }));
    expect(screen.getByText(/nenhum débito correspondente/i)).toBeInTheDocument();
  });

  it('renders "envie o extrato bancário" call-to-action', () => {
    renderBanner(makeCandidate({ confidence: 'none' }));
    expect(screen.getByText(/envie o extrato bancário/i)).toBeInTheDocument();
  });

  it('does not render any checkbox for none confidence', () => {
    renderBanner(makeCandidate({ confidence: 'none' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
