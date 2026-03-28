import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Flex,
  Heading,
  Input,
  Spinner,
  Text,
} from '@chakra-ui/react';
import { Alert } from '@chakra-ui/react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { listTransactions, ApiError } from '../api/transactions';
import {
  aggregateExpensesByCategory,
  computeNetBalance,
  getCurrentMonth,
  getBalanceColor,
} from '../utils/dashboard';
import type { CategoryTotal, BalanceSummary } from '../utils/dashboard';
import { formatCurrency } from '../utils/format';
import { useAuth } from '../auth/useAuth';

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088fe',
  '#00c49f', '#ffbb28', '#ff8042', '#a4de6c', '#d0ed57',
];

export function DashboardPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [month, setMonth] = useState(getCurrentMonth);
  const [categoryData, setCategoryData] = useState<CategoryTotal[]>([]);
  const [balanceSummary, setBalanceSummary] = useState<BalanceSummary>({
    totalIncome: 0,
    totalExpenses: 0,
    netBalance: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const [expTransactions, allTransactions] = await Promise.all([
        listTransactions(selectedMonth, 'EXP'),
        listTransactions(selectedMonth),
      ]);
      setCategoryData(aggregateExpensesByCategory(expTransactions));
      setBalanceSummary(computeNetBalance(allTransactions));
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 401) {
        await signOut();
        navigate('/login');
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [signOut, navigate]);

  useEffect(() => {
    void fetchData(month);
  }, [month, fetchData]);

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setMonth(e.target.value);
  };

  const totalExpenses = categoryData.reduce((sum, c) => sum + c.total, 0);

  const balanceColor = getBalanceColor(balanceSummary.netBalance);
  const balanceColorValue = balanceColor === 'green'
    ? 'green.600'
    : balanceColor === 'red'
      ? 'red.600'
      : 'gray.600';

  return (
    <Box p={8}>
      <Heading as="h1" mb={6}>Dashboard</Heading>

      <Input
        type="month"
        value={month}
        onChange={handleMonthChange}
        maxW="220px"
        mb={6}
      />

      {loading ? (
        <Flex justify="center" py={10}>
          <Spinner />
        </Flex>
      ) : error ? (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      ) : (
        <Flex direction={{ base: 'column', md: 'row' }} gap={8}>
          {/* Pie Chart Section */}
          <Box flex="1">
            <Heading as="h2" size="md" mb={4}>Expenses by Category</Heading>
            {categoryData.length === 0 ? (
              <Text>No expense data available</Text>
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
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Box>

          {/* Balance Section */}
          <Box flex="1">
            <Heading as="h2" size="md" mb={4}>Balance Summary</Heading>
            <Flex direction="column" gap={3}>
              <Flex justify="space-between">
                <Text>Income</Text>
                <Text color="green.600" fontWeight="bold">
                  {formatCurrency(balanceSummary.totalIncome)}
                </Text>
              </Flex>
              <Flex justify="space-between">
                <Text>Expenses</Text>
                <Text color="red.600" fontWeight="bold">
                  {formatCurrency(balanceSummary.totalExpenses)}
                </Text>
              </Flex>
              <Box borderTopWidth="1px" borderColor="gray.200" pt={3}>
                <Flex justify="space-between">
                  <Text fontWeight="bold">Net Balance</Text>
                  <Text color={balanceColorValue} fontWeight="bold">
                    {formatCurrency(balanceSummary.netBalance)}
                  </Text>
                </Flex>
              </Box>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
