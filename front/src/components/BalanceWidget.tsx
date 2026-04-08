import {
  Box,
  Button,
  Flex,
  Heading,
  Skeleton,
  Text,
} from '@chakra-ui/react';
import { Alert } from '@chakra-ui/react';
import type { SingleMonthResponse, RangeResponse } from '../api/balance';
import { formatCurrency } from '../utils/format';

function formatMonthLabel(yearMonth: string): string {
  const date = new Date(yearMonth + '-01T00:00:00');
  return new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

interface BalanceWidgetProps {
  mode: 'single' | 'range';
  isLoading: boolean;
  error: string | null;
  singleData: SingleMonthResponse | null;
  rangeData: RangeResponse | null;
  onRetry: () => void;
}

export function BalanceWidget({
  mode,
  isLoading,
  error,
  singleData,
  rangeData,
  onRetry,
}: BalanceWidgetProps): React.JSX.Element {
  return (
    <Box
      bg="white"
      borderRadius="14px"
      border="1px solid"
      borderColor="#E5E7EB"
      p={6}
    >
      <Heading as="h2" fontSize="md" fontWeight="600" color="#0B1426" mb={5}>
        Visão geral do saldo
      </Heading>

      {isLoading ? (
        mode === 'range' ? (
          <Skeleton height="200px" borderRadius="10px" />
        ) : (
          <Flex direction={{ base: 'column', md: 'row' }} gap={4}>
            <Skeleton height="80px" borderRadius="10px" flex="1" />
            <Skeleton height="80px" borderRadius="10px" flex="1" />
            <Skeleton height="80px" borderRadius="10px" flex="1" />
          </Flex>
        )
      ) : error ? (
        <Box>
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
          <Button
            mt={3}
            size="sm"
            variant="outline"
            borderColor="#E5E7EB"
            color="#0B1426"
            onClick={onRetry}
          >
            Tentar novamente
          </Button>
        </Box>
      ) : mode === 'single' && singleData ? (
        <Flex direction={{ base: 'column', md: 'row' }} gap={4}>
          <Box bg="#F0FDF4" borderRadius="10px" p={4} flex="1">
            <Text color="#6B7280" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em" mb="1">
              Receitas
            </Text>
            <Text color="#16A34A" fontSize="xl" fontWeight="700">
              {formatCurrency(singleData.totalIncome)}
            </Text>
          </Box>

          <Box bg="#FEF2F2" borderRadius="10px" p={4} flex="1">
            <Text color="#6B7280" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em" mb="1">
              Despesas
            </Text>
            <Text color="#DC2626" fontSize="xl" fontWeight="700">
              {formatCurrency(singleData.totalExpenses)}
            </Text>
          </Box>

          <Box bg="#0B1426" borderRadius="10px" p={4} flex="1">
            <Text color="whiteAlpha.600" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em" mb="1">
              Saldo
            </Text>
            <Text
              color={singleData.balance >= 0 ? '#16A34A' : '#DC2626'}
              fontSize="xl"
              fontWeight="700"
            >
              {formatCurrency(singleData.balance)}
            </Text>
          </Box>
        </Flex>
      ) : mode === 'range' && rangeData ? (
        <Box overflowX="auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#6B7280', fontWeight: 600 }}>Mês</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6B7280', fontWeight: 600 }}>Receitas</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6B7280', fontWeight: 600 }}>Despesas</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', color: '#6B7280', fontWeight: 600 }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rangeData.months.map((m) => (
                <tr key={m.month} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '8px 12px', color: '#0B1426', textTransform: 'capitalize' }}>
                    {formatMonthLabel(m.month)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 12px', color: '#16A34A' }}>
                    {formatCurrency(m.totalIncome)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 12px', color: '#DC2626' }}>
                    {formatCurrency(m.totalExpenses)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 12px', color: m.balance >= 0 ? '#16A34A' : '#DC2626' }}>
                    {formatCurrency(m.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0B1426' }}>Total geral</td>
                <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#16A34A' }}>
                  {formatCurrency(rangeData.totals.totalIncome)}
                </td>
                <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: '#DC2626' }}>
                  {formatCurrency(rangeData.totals.totalExpenses)}
                </td>
                <td style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 700, color: rangeData.totals.balance >= 0 ? '#16A34A' : '#DC2626' }}>
                  {formatCurrency(rangeData.totals.balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </Box>
      ) : null}
    </Box>
  );
}
