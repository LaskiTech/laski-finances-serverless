import { Box, Checkbox, Flex, Text } from '@chakra-ui/react';
import type { ReconciliationCandidate } from '../../api/statements';
import { formatCurrency } from '../../utils/format';

interface ReconciliationBannerProps {
  candidate: ReconciliationCandidate;
  accepted: boolean;
  onToggle: () => void;
  chosenParent?: string;
  onChoose: (sk: string) => void;
}

export function ReconciliationBanner({
  candidate,
  accepted,
  onToggle,
  chosenParent,
  onChoose,
}: ReconciliationBannerProps): React.JSX.Element {
  const color =
    candidate.confidence === 'high'
      ? 'green'
      : candidate.confidence === 'ambiguous'
      ? 'orange'
      : 'gray';

  return (
    <Box
      bg={`${color}.50`}
      border="1px solid"
      borderColor={`${color}.200`}
      p={4}
      mb={2}
      borderRadius="md"
    >
      {candidate.confidence === 'high' && (
        <Flex align="center" gap={3}>
          <Checkbox.Root checked={accepted} onCheckedChange={onToggle}>
            <Checkbox.HiddenInput />
            <Checkbox.Control />
          </Checkbox.Root>
          <Text>
            Detectamos que esta fatura foi paga pelo débito &quot;
            {candidate.parentDescription ?? 'transferência bancária'}&quot; no valor de{' '}
            <b>{formatCurrency(candidate.totalAmount)}</b>. Vincular {candidate.childCount} cobranças
            ao pagamento?
          </Text>
        </Flex>
      )}
      {candidate.confidence === 'ambiguous' && (
        <Box>
          <Text mb={2}>
            Encontramos várias transações bancárias que podem ter pago esta fatura de{' '}
            <b>{formatCurrency(candidate.totalAmount)}</b>. Escolha a correta:
          </Text>
          {(candidate.candidateParents ?? []).map((p) => (
            <label key={p.sk} style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="radio"
                name={`candidate-${candidate.candidateId}`}
                checked={chosenParent === p.sk}
                onChange={() => {
                  onChoose(p.sk);
                  if (!accepted) onToggle();
                }}
              />
              {` ${p.date} — ${p.description}`}
            </label>
          ))}
        </Box>
      )}
      {candidate.confidence === 'none' && (
        <Text>
          Nenhum débito correspondente de <b>{formatCurrency(candidate.totalAmount)}</b> encontrado
          na conta corrente. Envie o extrato bancário para vincular automaticamente.
        </Text>
      )}
    </Box>
  );
}
