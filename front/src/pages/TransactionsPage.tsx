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
    <Box p={8}>
      <Flex justify="space-between" align="center" mb={6}>
        <Heading as="h1">Transactions</Heading>
        <Button
          colorPalette="blue"
          onClick={() => navigate('/transactions/new')}
        >
          New Transaction
        </Button>
      </Flex>

      <Flex gap={4} mb={6}>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          maxW="200px"
        />
        <NativeSelect.Root maxW="160px">
          <NativeSelect.Field
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as '' | 'INC' | 'EXP')
            }
          >
            <option value="">All</option>
            <option value="INC">INC</option>
            <option value="EXP">EXP</option>
          </NativeSelect.Field>
        </NativeSelect.Root>
      </Flex>

      {loading ? (
        <Flex justify="center" py={10}>
          <Spinner />
        </Flex>
      ) : transactions.length === 0 ? (
        <Text>No transactions found.</Text>
      ) : (
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Date</Table.ColumnHeader>
              <Table.ColumnHeader>Description</Table.ColumnHeader>
              <Table.ColumnHeader>Type</Table.ColumnHeader>
              <Table.ColumnHeader>Category</Table.ColumnHeader>
              <Table.ColumnHeader>Source</Table.ColumnHeader>
              <Table.ColumnHeader>Amount</Table.ColumnHeader>
              <Table.ColumnHeader>Installment</Table.ColumnHeader>
              <Table.ColumnHeader>Actions</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {transactions.map((tx) => (
              <Table.Row key={tx.sk}>
                <Table.Cell>{formatDate(tx.date)}</Table.Cell>
                <Table.Cell>{tx.description}</Table.Cell>
                <Table.Cell>
                  <Badge
                    colorPalette={tx.type === 'INC' ? 'green' : 'red'}
                  >
                    {tx.type}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{tx.category}</Table.Cell>
                <Table.Cell>{tx.source}</Table.Cell>
                <Table.Cell>{formatCurrency(tx.amount)}</Table.Cell>
                <Table.Cell>
                  {tx.installmentTotal > 1
                    ? `${tx.installmentNumber}/${tx.installmentTotal}`
                    : '—'}
                </Table.Cell>
                <Table.Cell>
                  <Flex gap={2}>
                    <Button
                      size="sm"
                      variant="outline"
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
                      colorPalette="red"
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
      )}
    </Box>
  );
}
