import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Flex, Heading, Button } from '@chakra-ui/react';
import { AllTab } from '../components/transactions/AllTab';
import { IncomeTab } from '../components/transactions/IncomeTab';
import { ExpensesTab } from '../components/transactions/ExpensesTab';

type ActiveTab = 'all' | 'income' | 'expenses';

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'income', label: 'Receitas' },
  { id: 'expenses', label: 'Despesas' },
];

export function TransactionsPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab: ActiveTab =
    rawTab === 'income' || rawTab === 'expenses' ? rawTab : 'all';

  const [month, setMonth] = useState('');

  const handleTabChange = (tab: ActiveTab): void => {
    setSearchParams({ tab });
  };

  return (
    <Box p={{ base: 5, md: 8 }} maxW="1200px" mx="auto">
      <Heading
        as="h1"
        fontSize="2xl"
        fontWeight="700"
        color="#0B1426"
        letterSpacing="-0.02em"
        mb={6}
      >
        Transações
      </Heading>

      {/* Tab strip */}
      <Flex mb={6} borderBottom="1px solid" borderColor="#E5E7EB" gap={1} pb="1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              variant="ghost"
              fontWeight={isActive ? '600' : '400'}
              fontSize="sm"
              color={isActive ? 'white' : '#6B7280'}
              bg={isActive ? '#0B1426' : 'transparent'}
              borderRadius="8px"
              pb="2"
              pt="2"
              px="5"
              h="auto"
              _hover={{ color: '#0B1426', bg: isActive ? '#0B1426' : '#F3F4F6' }}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </Button>
          );
        })}
      </Flex>

      {/* Tab content */}
      {activeTab === 'all' && (
        <AllTab month={month} onMonthChange={setMonth} />
      )}
      {activeTab === 'income' && (
        <IncomeTab month={month} onMonthChange={setMonth} />
      )}
      {activeTab === 'expenses' && (
        <ExpensesTab month={month} onMonthChange={setMonth} />
      )}
    </Box>
  );
}
