import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Text,
  Table,
  Spinner,
  Flex,
  Input,
} from '@chakra-ui/react';
import {
  listTransactions,
  deleteTransaction,
  type TransactionItem,
} from '../../api/transactions';
import { formatCurrency, formatDate } from '../../utils/format';

interface ExpensesTabProps {
  month: string;
  onMonthChange: (month: string) => void;
}

export function ExpensesTab({ month, onMonthChange }: ExpensesTabProps): React.JSX.Element {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTransactions(month || undefined, 'EXP');
      setExpenses([...data].sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void fetchExpenses();
  }, [fetchExpenses]);

  const handleDelete = async (tx: TransactionItem): Promise<void> => {
    const confirmed = window.confirm('Tem certeza que deseja excluir esta despesa?');
    if (!confirmed) return;

    let deleteGroup = false;
    if (tx.installmentTotal > 1) {
      deleteGroup = window.confirm('Excluir todas as parcelas deste grupo?');
    }

    try {
      await deleteTransaction(tx.sk, deleteGroup);
      await fetchExpenses();
    } catch (error) {
      console.error('Failed to delete expense:', error);
    }
  };

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={6}>
        <Input
          type="month"
          value={month}
          onChange={(e) => onMonthChange(e.target.value)}
          maxW="180px"
          h="40px"
          borderRadius="10px"
          borderColor="#E5E7EB"
          bg="white"
          fontSize="sm"
          _hover={{ borderColor: '#D1D5DB' }}
          _focus={{ borderColor: '#00D4AA', boxShadow: '0 0 0 3px rgba(0, 212, 170, 0.1)' }}
        />
        <Button
          bg="#0B1426"
          color="white"
          fontWeight="600"
          fontSize="sm"
          borderRadius="10px"
          h="40px"
          px="5"
          _hover={{ bg: '#162038' }}
          onClick={() => navigate('/transactions/expense/new')}
        >
          Nova despesa
        </Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#00D4AA" size="lg" />
        </Flex>
      ) : expenses.length === 0 ? (
        <Flex
          justify="center"
          align="center"
          bg="white"
          borderRadius="14px"
          border="1px solid"
          borderColor="#E5E7EB"
          py={16}
        >
          <Text color="#9CA3AF" fontSize="sm">Nenhuma despesa encontrada.</Text>
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
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Data</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Descrição</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Categoria</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Fonte</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Valor</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Parcela</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Ações</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {expenses.map((tx) => (
                <Table.Row key={tx.sk} _hover={{ bg: '#FAFBFC' }} transition="background 0.15s">
                  <Table.Cell fontSize="sm" color="#374151">{formatDate(tx.date)}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#0B1426" fontWeight="500">{tx.description}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#374151">{tx.category}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#374151">{tx.source}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#DC2626" fontWeight="600">{formatCurrency(tx.amount)}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#6B7280">
                    {tx.installmentTotal > 1 ? `${tx.installmentNumber}/${tx.installmentTotal}` : '—'}
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
                        _hover={{ bg: '#F9FAFB', borderColor: '#D1D5DB' }}
                        onClick={() =>
                          navigate(`/transactions/expense/edit/${encodeURIComponent(tx.sk)}`)
                        }
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        fontSize="xs"
                        borderRadius="8px"
                        borderColor="#FECACA"
                        color="#DC2626"
                        _hover={{ bg: '#FEF2F2', borderColor: '#DC2626' }}
                        onClick={() => void handleDelete(tx)}
                      >
                        Excluir
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
