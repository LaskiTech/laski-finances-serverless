import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Heading,
  Text,
  Table,
  Spinner,
  Badge,
  Flex,
  Input,
  NativeSelect,
} from '@chakra-ui/react';
import {
  listTransactions,
  deleteTransaction,
  type TransactionItem,
} from '../api/transactions';
import { formatCurrency, formatDate } from '../utils/format';

export function TransactionsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'INC' | 'EXP'>('');

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTransactions(
        month || undefined,
        typeFilter || undefined,
      );
      setTransactions(data);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [month, typeFilter]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  const handleDelete = async (tx: TransactionItem): Promise<void> => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this transaction?',
    );
    if (!confirmed) return;

    let deleteGroup = false;
    if (tx.installmentTotal > 1) {
      deleteGroup = window.confirm(
        'Delete all installments in this group?',
      );
    }

    try {
      await deleteTransaction(tx.sk, deleteGroup);
      await fetchTransactions();
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  };

  return (
    <Box p={{ base: 5, md: 8 }} maxW="1200px" mx="auto">
      <Flex justify="space-between" align="center" mb={6}>
        <Heading
          as="h1"
          fontSize="2xl"
          fontWeight="700"
          color="#0B1426"
          letterSpacing="-0.02em"
        >
          Transactions
        </Heading>
        <Button
          bg="#0B1426"
          color="white"
          fontWeight="600"
          fontSize="sm"
          borderRadius="10px"
          h="40px"
          px="5"
          _hover={{ bg: "#162038" }}
          onClick={() => navigate('/transactions/new')}
        >
          New Transaction
        </Button>
      </Flex>

      <Flex gap={3} mb={6}>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          maxW="180px"
          h="40px"
          borderRadius="10px"
          borderColor="#E5E7EB"
          bg="white"
          fontSize="sm"
          _hover={{ borderColor: "#D1D5DB" }}
          _focus={{ borderColor: "#00D4AA", boxShadow: "0 0 0 3px rgba(0, 212, 170, 0.1)" }}
        />
        <NativeSelect.Root maxW="140px">
          <NativeSelect.Field
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as '' | 'INC' | 'EXP')
            }
            h="40px"
            borderRadius="10px"
            borderColor="#E5E7EB"
            bg="white"
            fontSize="sm"
          >
            <option value="">All</option>
            <option value="INC">INC</option>
            <option value="EXP">EXP</option>
          </NativeSelect.Field>
        </NativeSelect.Root>
      </Flex>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#00D4AA" size="lg" />
        </Flex>
      ) : transactions.length === 0 ? (
        <Flex
          justify="center"
          align="center"
          bg="white"
          borderRadius="14px"
          border="1px solid"
          borderColor="#E5E7EB"
          py={16}
        >
          <Text color="#9CA3AF" fontSize="sm">No transactions found.</Text>
        </Flex>
      ) : (
        <Box
          bg="white"
          borderRadius="14px"
          border="1px solid"
          borderColor="#E5E7EB"
          overflow="hidden"
        >
          <Table.Root>
            <Table.Header>
              <Table.Row bg="#FAFBFC">
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Date</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Description</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Type</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Category</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Source</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Amount</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Installment</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Actions</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {transactions.map((tx) => (
                <Table.Row
                  key={tx.sk}
                  _hover={{ bg: "#FAFBFC" }}
                  transition="background 0.15s"
                >
                  <Table.Cell fontSize="sm" color="#374151">{formatDate(tx.date)}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#0B1426" fontWeight="500">{tx.description}</Table.Cell>
                  <Table.Cell>
                    <Badge
                      bg={tx.type === 'INC' ? '#F0FDF4' : '#FEF2F2'}
                      color={tx.type === 'INC' ? '#16A34A' : '#DC2626'}
                      fontSize="xs"
                      fontWeight="600"
                      borderRadius="6px"
                      px="2"
                      py="0.5"
                    >
                      {tx.type}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell fontSize="sm" color="#374151">{tx.category}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#374151">{tx.source}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#0B1426" fontWeight="600">{formatCurrency(tx.amount)}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#6B7280">
                    {tx.installmentTotal > 1
                      ? `${tx.installmentNumber}/${tx.installmentTotal}`
                      : '—'}
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap={2}>
                      <Button
                        size="sm"
                        variant="outline"
                        fontSize="xs"
                        borderRadius="8px"
                        borderColor="#E5E7EB"
                        color="#374151"
                        _hover={{ bg: "#F9FAFB", borderColor: "#D1D5DB" }}
                        onClick={() =>
                          navigate(
                            `/transactions/edit/${encodeURIComponent(tx.sk)}`,
                          )
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        fontSize="xs"
                        borderRadius="8px"
                        borderColor="#FECACA"
                        color="#DC2626"
                        _hover={{ bg: "#FEF2F2", borderColor: "#DC2626" }}
                        onClick={() => void handleDelete(tx)}
                      >
                        Delete
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Box>
  );
}
