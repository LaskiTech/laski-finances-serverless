import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Spinner,
  Text,
} from '@chakra-ui/react';
import { Alert } from '@chakra-ui/react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { listTransactions, ApiError } from '../api/transactions';
import { getSingleMonthBalance, getRangeBalance } from '../api/balance';
import type { SingleMonthResponse, RangeResponse } from '../api/balance';
import {
  aggregateExpensesByCategory,
  getCurrentMonth,
  enumerateMonths,
} from '../utils/dashboard';
import type { CategoryTotal } from '../utils/dashboard';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../auth/useAuth';
import { BalanceWidget } from '../components/BalanceWidget';

const COLORS = [
  '#6366F1', '#F59E0B', '#EF4444', '#8B5CF6', '#F97316',
  '#EC4899', '#06B6D4', '#0B1426', '#14B8A6', '#A78BFA',
];

type DashboardMode = 'single' | 'range';

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function validateRange(from: string, to: string): string | null {
  if (from > to) return 'O mês inicial não pode ser posterior ao mês final.';
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) + 1;
  if (months > 24) return 'O período não pode exceder 24 meses.';
  return null;
}

export function DashboardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // Single-month state
  const [mode, setMode] = useState<DashboardMode>('single');
  const [month, setMonth] = useState(getCurrentMonth);

  // Range state
  const [rangeFrom, setRangeFrom] = useState(currentYearMonth);
  const [rangeTo, setRangeTo] = useState(currentYearMonth);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Chart state (always driven by single month)
  const [categoryData, setCategoryData] = useState<CategoryTotal[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  // Balance widget state
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [singleData, setSingleData] = useState<SingleMonthResponse | null>(null);
  const [rangeData, setRangeData] = useState<RangeResponse | null>(null);

  const fetchChartData = useCallback(async (from: string, to?: string) => {
    setChartLoading(true);
    setChartError(null);
    try {
      const months = to ? enumerateMonths(from, to) : [from];
      const results = await Promise.all(months.map(m => listTransactions(m, 'EXP')));
      setCategoryData(aggregateExpensesByCategory(results.flat()));
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        await signOut();
        navigate('/login');
        return;
      }
      const message = err instanceof Error ? err.message : 'Falha ao carregar dados do painel.';
      setChartError(message);
    } finally {
      setChartLoading(false);
    }
  }, [signOut, navigate]);

  const fetchSingleBalance = useCallback(async (selectedMonth: string) => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const data = await getSingleMonthBalance(selectedMonth);
      setSingleData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar dados de saldo.';
      setBalanceError(message);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const fetchRangeBalance = useCallback(async (from: string, to: string) => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const data = await getRangeBalance(from, to);
      setRangeData(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar dados do período.';
      setBalanceError(message);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChartData(month);
    void fetchSingleBalance(month);
  }, [month, fetchChartData, fetchSingleBalance]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setMonth(e.target.value);
  };

  const handleViewRange = (): void => {
    setMode('range');
    setRangeData(null);
    setRangeError(null);
  };

  const handleBackToMonth = (): void => {
    setMode('single');
    setRangeData(null);
    setRangeError(null);
    void fetchSingleBalance(month);
  };

  const handleRangeShow = (): void => {
    const err = validateRange(rangeFrom, rangeTo);
    if (err) { setRangeError(err); return; }
    setRangeError(null);
    void fetchRangeBalance(rangeFrom, rangeTo);
    void fetchChartData(rangeFrom, rangeTo);
  };

  const handleRetry = (): void => {
    if (mode === 'range') {
      void fetchRangeBalance(rangeFrom, rangeTo);
    } else {
      void fetchSingleBalance(month);
    }
  };

  const totalExpenses = categoryData.reduce((sum, c) => sum + c.total, 0);

  return (
    <Box p={{ base: 5, md: 8 }} maxW="1200px" mx="auto">
      {/* Header with unified date control */}
      <Flex justify="space-between" align="center" mb="6" gap={3} wrap="wrap">
        <Heading
          as="h1"
          fontSize="2xl"
          fontWeight="700"
          color="#0B1426"
          letterSpacing="-0.02em"
        >
          Dashboard
        </Heading>

        {mode === 'single' ? (
          <Flex align="center" gap={3}>
            <Input
              type="month"
              value={month}
              onChange={handleMonthChange}
              maxW="180px"
              h="40px"
              borderRadius="10px"
              borderColor="#E5E7EB"
              bg="white"
              fontSize="sm"
              _hover={{ borderColor: "#D1D5DB" }}
              _focus={{ borderColor: "#00D4AA", boxShadow: "0 0 0 3px rgba(0, 212, 170, 0.1)" }}
            />
            <Button
              variant="outline"
              size="sm"
              borderColor="#E5E7EB"
              color="#6B7280"
              fontWeight="500"
              fontSize="xs"
              borderRadius="8px"
              h="40px"
              px="4"
              _hover={{ borderColor: '#D1D5DB', color: '#0B1426' }}
              onClick={handleViewRange}
            >
              Ver período
            </Button>
          </Flex>
        ) : (
          <Flex align="flex-end" gap={3} wrap="wrap">
            <Button
              variant="ghost"
              size="sm"
              color="#6B7280"
              h="40px"
              onClick={handleBackToMonth}
            >
              ← Voltar para mês
            </Button>
            <Box>
              <Text fontSize="xs" color="#6B7280" mb={1}>De</Text>
              <input
                type="month"
                value={rangeFrom}
                onChange={(e) => { setRangeFrom(e.target.value); setRangeError(null); }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB',
                  fontSize: '14px',
                  color: '#0B1426',
                  height: '40px',
                }}
              />
            </Box>
            <Box>
              <Text fontSize="xs" color="#6B7280" mb={1}>Até</Text>
              <input
                type="month"
                value={rangeTo}
                onChange={(e) => { setRangeTo(e.target.value); setRangeError(null); }}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB',
                  fontSize: '14px',
                  color: '#0B1426',
                  height: '40px',
                }}
              />
            </Box>
            <Button
              size="sm"
              bg="#0B1426"
              color="white"
              borderRadius="8px"
              h="40px"
              _hover={{ bg: '#1a2744' }}
              onClick={handleRangeShow}
            >
              Exibir
            </Button>
            {rangeError && (
              <Text color="#DC2626" fontSize="sm" role="alert" alignSelf="center">
                {rangeError}
              </Text>
            )}
          </Flex>
        )}
      </Flex>

      {/* Content */}
      {chartLoading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#00D4AA" size="lg" />
        </Flex>
      ) : chartError ? (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{chartError}</Alert.Title>
        </Alert.Root>
      ) : (
        <Flex direction={{ base: 'column', md: 'row' }} gap={6}>
          {/* Pie Chart Card — always shows current single month */}
          <Box
            flex="1"
            bg="white"
            borderRadius="14px"
            border="1px solid"
            borderColor="#E5E7EB"
            p={6}
          >
            <Heading
              as="h2"
              fontSize="md"
              fontWeight="600"
              color="#0B1426"
              mb={5}
            >
              Despesas por categoria{mode === 'range' ? ` — ${rangeFrom} a ${rangeTo}` : ''}
            </Heading>
            {categoryData.length === 0 ? (
              <Flex justify="center" align="center" h="200px">
                <Text color="#9CA3AF" fontSize="sm">Nenhum dado de despesa disponível</Text>
              </Flex>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    innerRadius={60}
                    strokeWidth={2}
                    stroke="#FAFBFC"
                    label={(props) => {
                      const { name, value } = props as { name: string; value: number };
                      const pct = totalExpenses > 0
                        ? ((value / totalExpenses) * 100).toFixed(1)
                        : '0.0';
                      return `${name}: ${formatCurrency(value)} (${pct}%)`;
                    }}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell
                        key={entry.category}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      borderRadius: '10px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      fontSize: '13px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Box>

          {/* Balance Widget — pure display, date controlled by page */}
          <Box flex="1">
            <BalanceWidget
              mode={mode}
              isLoading={balanceLoading}
              error={balanceError}
              singleData={singleData}
              rangeData={rangeData}
              onRetry={handleRetry}
            />
          </Box>
        </Flex>
      )}
    </Box>
  );
}
