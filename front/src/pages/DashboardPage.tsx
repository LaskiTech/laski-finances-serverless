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
  '#00D4AA', '#0B1426', '#6366F1', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4',
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
    ? '#16A34A'
    : balanceColor === 'red'
      ? '#DC2626'
      : '#6B7280';

  return (
    <Box p={{ base: 5, md: 8 }} maxW="1200px" mx="auto">
      <Flex justify="space-between" align="center" mb="6">
        <Heading
          as="h1"
          fontSize="2xl"
          fontWeight="700"
          color="#0B1426"
          letterSpacing="-0.02em"
        >
          Dashboard
        </Heading>

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
      </Flex>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#00D4AA" size="lg" />
        </Flex>
      ) : error ? (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      ) : (
        <Flex direction={{ base: 'column', md: 'row' }} gap={6}>
          {/* Pie Chart Card */}
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
              Expenses by Category
            </Heading>
            {categoryData.length === 0 ? (
              <Flex justify="center" align="center" h="200px">
                <Text color="#9CA3AF" fontSize="sm">No expense data available</Text>
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

          {/* Balance Card */}
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
              Balance Summary
            </Heading>
            <Flex direction="column" gap={4}>
              <Box
                bg="#F0FDF4"
                borderRadius="10px"
                p={4}
              >
                <Text color="#6B7280" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em" mb="1">
                  Income
                </Text>
                <Text color="#16A34A" fontSize="xl" fontWeight="700">
                  {formatCurrency(balanceSummary.totalIncome)}
                </Text>
              </Box>

              <Box
                bg="#FEF2F2"
                borderRadius="10px"
                p={4}
              >
                <Text color="#6B7280" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em" mb="1">
                  Expenses
                </Text>
                <Text color="#DC2626" fontSize="xl" fontWeight="700">
                  {formatCurrency(balanceSummary.totalExpenses)}
                </Text>
              </Box>

              <Box
                bg="#0B1426"
                borderRadius="10px"
                p={4}
              >
                <Text color="whiteAlpha.600" fontSize="xs" textTransform="uppercase" letterSpacing="0.05em" mb="1">
                  Net Balance
                </Text>
                <Text color={balanceColorValue === '#6B7280' ? 'whiteAlpha.900' : balanceColorValue} fontSize="xl" fontWeight="700">
                  {formatCurrency(balanceSummary.netBalance)}
                </Text>
              </Box>
            </Flex>
          </Box>
        </Flex>
      )}
    </Box>
  );
}
