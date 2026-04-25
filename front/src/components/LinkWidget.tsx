import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Heading,
  Text,
  Flex,
  Input,
  Spinner,
  Badge,
} from '@chakra-ui/react';
import {
  listLinks,
  createLink,
  deleteLink,
  type LinkEntry,
} from '../api/links';
import { listTransactions, type TransactionItem } from '../api/transactions';
import { formatCurrency, formatDate } from '../utils/format';

interface LinkWidgetProps {
  sk: string;
  typeFilter?: 'INC' | 'EXP';
}

export function LinkWidget({ sk, typeFilter }: LinkWidgetProps): React.JSX.Element {
  const [asParent, setAsParent] = useState<LinkEntry[]>([]);
  const [asChild, setAsChild] = useState<LinkEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [monthQuery, setMonthQuery] = useState('');
  const [sourceQuery, setSourceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TransactionItem[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listLinks(sk);
      setAsParent(data.asParent);
      setAsChild(data.asChild);
    } catch (error) {
      console.error('Failed to fetch links:', error);
    } finally {
      setLoading(false);
    }
  }, [sk]);

  useEffect(() => {
    void fetchLinks();
  }, [fetchLinks]);

  const handleSearch = async (): Promise<void> => {
    const month = /^\d{4}-\d{2}$/.test(monthQuery.trim()) ? monthQuery.trim() : undefined;
    const source = sourceQuery.trim().toLowerCase();
    if (!month && !source) return;
    setSearching(true);
    try {
      const results = await listTransactions(month, typeFilter);
      const linkedSks = new Set([
        ...asParent.map((l) => l.childSk),
        ...asChild.map((l) => l.parentSk),
        sk,
      ]);
      setSearchResults(
        results.filter((tx) => {
          if (linkedSks.has(tx.sk)) return false;
          if (source && !tx.source.toLowerCase().includes(source)) return false;
          return true;
        }),
      );
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddLink = async (targetSk: string): Promise<void> => {
    try {
      await createLink(sk, targetSk);
      setShowSearch(false);
      setMonthQuery('');
      setSourceQuery('');
      setSearchResults([]);
      await fetchLinks();
    } catch (error) {
      console.error('Failed to create link:', error);
    }
  };

  const handleRemoveLink = async (linkId: string): Promise<void> => {
    const confirmed = window.confirm('Remove this link?');
    if (!confirmed) return;
    try {
      await deleteLink(linkId);
      await fetchLinks();
    } catch (error) {
      console.error('Failed to delete link:', error);
    }
  };

  if (loading) {
    return (
      <Flex justify="center" py={4}>
        <Spinner color="#00D4AA" size="sm" />
      </Flex>
    );
  }

  return (
    <Box mt={6}>
      <Heading as="h3" fontSize="md" fontWeight="600" color="#0B1426" mb={3}>
        Linked Entries
      </Heading>

      {asParent.length > 0 && (
        <Box mb={4}>
          <Text fontSize="xs" fontWeight="600" color="#6B7280" textTransform="uppercase" mb={2}>
            This entry pays for
          </Text>
          {asParent.map((link) => (
            <LinkRow key={link.linkId} link={link} onRemove={handleRemoveLink} />
          ))}
        </Box>
      )}

      {asChild.length > 0 && (
        <Box mb={4}>
          <Text fontSize="xs" fontWeight="600" color="#6B7280" textTransform="uppercase" mb={2}>
            Paid by
          </Text>
          {asChild.map((link) => (
            <LinkRow key={link.linkId} link={link} onRemove={handleRemoveLink} />
          ))}
        </Box>
      )}

      {asParent.length === 0 && asChild.length === 0 && (
        <Text fontSize="sm" color="#9CA3AF" mb={3}>No linked entries.</Text>
      )}

      {!showSearch ? (
        <Button
          size="sm"
          variant="outline"
          fontSize="xs"
          borderRadius="8px"
          borderColor="#E5E7EB"
          color="#374151"
          _hover={{ bg: "#F9FAFB", borderColor: "#D1D5DB" }}
          onClick={() => setShowSearch(true)}
        >
          Add link
        </Button>
      ) : (
        <Box
          bg="#F9FAFB"
          borderRadius="10px"
          border="1px solid"
          borderColor="#E5E7EB"
          p={3}
        >
          <Flex gap={2} mb={2} wrap="wrap">
            <Input
              placeholder="Mês (YYYY-MM)"
              value={monthQuery}
              onChange={(e) => setMonthQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
              h="36px"
              w="130px"
              flexShrink={0}
              borderRadius="8px"
              borderColor="#E5E7EB"
              bg="white"
              fontSize="sm"
            />
            <Input
              placeholder="Fonte"
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); }}
              h="36px"
              flex="1"
              minW="100px"
              borderRadius="8px"
              borderColor="#E5E7EB"
              bg="white"
              fontSize="sm"
            />
            <Button
              size="sm"
              bg="#0B1426"
              color="white"
              fontSize="xs"
              borderRadius="8px"
              _hover={{ bg: "#162038" }}
              loading={searching}
              onClick={() => void handleSearch()}
            >
              Buscar
            </Button>
            <Button
              size="sm"
              variant="outline"
              fontSize="xs"
              borderRadius="8px"
              borderColor="#E5E7EB"
              color="#374151"
              onClick={() => {
                setShowSearch(false);
                setSearchResults([]);
                setMonthQuery('');
                setSourceQuery('');
              }}
            >
              Cancelar
            </Button>
          </Flex>

          {searchResults.length > 0 && (
            <Flex direction="column" gap={1} maxH="200px" overflowY="auto">
              {searchResults.map((tx) => (
                <Flex
                  key={tx.sk}
                  justify="space-between"
                  align="center"
                  p={2}
                  borderRadius="6px"
                  _hover={{ bg: "white" }}
                  cursor="pointer"
                  onClick={() => void handleAddLink(tx.sk)}
                >
                  <Flex gap={2} align="center">
                    <Badge
                      bg={tx.type === 'INC' ? '#F0FDF4' : '#FEF2F2'}
                      color={tx.type === 'INC' ? '#16A34A' : '#DC2626'}
                      fontSize="xs"
                      borderRadius="4px"
                      px="1.5"
                    >
                      {tx.type}
                    </Badge>
                    <Text fontSize="xs" color="#0B1426" fontWeight="500">{tx.description}</Text>
                  </Flex>
                  <Text fontSize="xs" color="#6B7280">
                    {formatDate(tx.date)} - {formatCurrency(tx.amount)}
                  </Text>
                </Flex>
              ))}
            </Flex>
          )}
        </Box>
      )}
    </Box>
  );
}

function LinkRow({
  link,
  onRemove,
}: {
  link: LinkEntry;
  onRemove: (linkId: string) => Promise<void>;
}): React.JSX.Element {
  const c = link.counterpart;
  return (
    <Flex
      justify="space-between"
      align="center"
      p={2}
      mb={1}
      bg="white"
      borderRadius="8px"
      border="1px solid"
      borderColor="#E5E7EB"
    >
      <Flex gap={2} align="center">
        <Badge
          bg={c.type === 'INC' ? '#F0FDF4' : '#FEF2F2'}
          color={c.type === 'INC' ? '#16A34A' : '#DC2626'}
          fontSize="xs"
          borderRadius="4px"
          px="1.5"
        >
          {c.type}
        </Badge>
        <Text fontSize="sm" color="#0B1426" fontWeight="500">{c.description}</Text>
        <Text fontSize="xs" color="#6B7280">
          {formatDate(c.date)} - {formatCurrency(c.amount)}
        </Text>
      </Flex>
      <Button
        size="xs"
        variant="ghost"
        color="#DC2626"
        fontSize="xs"
        _hover={{ bg: "#FEF2F2" }}
        onClick={() => void onRemove(link.linkId)}
      >
        Remove
      </Button>
    </Flex>
  );
}
