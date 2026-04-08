import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Text,
  Table,
  Spinner,
  Badge,
  Flex,
  Input,
} from '@chakra-ui/react';
import {
  listIncome,
  deleteIncome,
  type IncomeItem,
} from '../../api/income';
import { formatCurrency, formatDate } from '../../utils/format';

interface IncomeTabProps {
  month: string;
  onMonthChange: (month: string) => void;
}

export function IncomeTab({ month, onMonthChange }: IncomeTabProps): React.JSX.Element {
  const navigate = useNavigate();
  const [income, setIncome] = useState<IncomeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchIncome = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listIncome(month || undefined);
      setIncome([...data].sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error) {
      console.error('Failed to fetch income:', error);
      setIncome([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void fetchIncome();
  }, [fetchIncome]);

  const handleDelete = async (item: IncomeItem): Promise<void> => {
    const confirmed = window.confirm('Tem certeza que deseja excluir esta receita?');
    if (!confirmed) return;

    let deleteGroup = false;
    if (item.isRecurring) {
      deleteGroup = window.confirm('Excluir esta e todas as futuras entradas desta série recorrente?');
    }

    try {
      await deleteIncome(item.sk, deleteGroup);
      await fetchIncome();
    } catch (error) {
      console.error('Failed to delete income:', error);
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
          onClick={() => navigate('/transactions/income/new')}
        >
          Nova receita
        </Button>
      </Flex>

      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#00D4AA" size="lg" />
        </Flex>
      ) : income.length === 0 ? (
        <Flex
          justify="center"
          align="center"
          bg="white"
          borderRadius="14px"
          border="1px solid"
          borderColor="#E5E7EB"
          py={16}
        >
          <Text color="#9CA3AF" fontSize="sm">Nenhuma receita encontrada.</Text>
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
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Recorrente</Table.ColumnHeader>
                <Table.ColumnHeader fontSize="xs" color="#6B7280" textTransform="uppercase" letterSpacing="0.05em" fontWeight="600">Ações</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {income.map((item) => (
                <Table.Row key={item.sk} _hover={{ bg: '#FAFBFC' }} transition="background 0.15s">
                  <Table.Cell fontSize="sm" color="#374151">{formatDate(item.date)}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#0B1426" fontWeight="500">{item.description}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#374151">{item.category}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#374151">{item.source}</Table.Cell>
                  <Table.Cell fontSize="sm" color="#16A34A" fontWeight="600">{formatCurrency(item.amount)}</Table.Cell>
                  <Table.Cell>
                    {item.isRecurring ? (
                      <Badge
                        bg="#EFF6FF"
                        color="#2563EB"
                        fontSize="xs"
                        fontWeight="600"
                        borderRadius="6px"
                        px="2"
                        py="0.5"
                      >
                        Recorrente
                      </Badge>
                    ) : (
                      <Text fontSize="sm" color="#9CA3AF">—</Text>
                    )}
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
                          navigate(`/transactions/income/edit/${encodeURIComponent(item.sk)}`)
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
                        onClick={() => void handleDelete(item)}
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
