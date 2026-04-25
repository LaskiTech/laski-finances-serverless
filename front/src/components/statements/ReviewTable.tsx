import { useState } from 'react';
import { Box, Checkbox, Editable, Table, Text } from '@chakra-ui/react';
import type { ExtractedTransaction, ExtractedInstallmentPreview } from '../../api/statements';
import { formatCurrency } from '../../utils/format';

interface ReviewTableProps {
  drafts: ExtractedTransaction[] | undefined;
  futureInstallments?: ExtractedInstallmentPreview[];
  selected: Set<number>;
  duplicateIndices: Set<number>;
  onToggle: (i: number) => void;
}

export function ReviewTable({
  drafts,
  futureInstallments,
  selected,
  duplicateIndices,
  onToggle,
}: ReviewTableProps): React.JSX.Element {
  const [categoryEdits, setCategoryEdits] = useState<Record<number, string>>({});
  const [sourceEdits, setSourceEdits] = useState<Record<number, string>>({});

  const rows = drafts ?? [];
  const future = futureInstallments ?? [];

  return (
    <Box overflowX="auto" bg="white" borderRadius="md" borderWidth="1px">
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="6" />
            <Table.ColumnHeader>Data</Table.ColumnHeader>
            <Table.ColumnHeader>Descrição</Table.ColumnHeader>
            <Table.ColumnHeader>Categoria</Table.ColumnHeader>
            <Table.ColumnHeader>Fonte</Table.ColumnHeader>
            <Table.ColumnHeader>Tipo</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="right">Valor</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, index) => {
            const isDuplicate = duplicateIndices.has(index);
            const categoryValue = categoryEdits[index] ?? row.category;
            const sourceValue = sourceEdits[index] ?? row.source;
            return (
              <Table.Row key={index} bg={isDuplicate ? 'yellow.50' : undefined}>
                <Table.Cell>
                  <Checkbox.Root
                    checked={selected.has(index)}
                    onCheckedChange={() => onToggle(index)}
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                  </Checkbox.Root>
                </Table.Cell>
                <Table.Cell>{row.date}</Table.Cell>
                <Table.Cell>
                  {row.description}
                  {isDuplicate && (
                    <Text as="span" color="yellow.700" ml={2} fontSize="xs">
                      (duplicata)
                    </Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Editable.Root
                    value={categoryValue}
                    onValueChange={(details) =>
                      setCategoryEdits((prev) => ({ ...prev, [index]: details.value }))
                    }
                  >
                    <Editable.Preview />
                    <Editable.Input aria-label={`categoria linha ${index}`} />
                  </Editable.Root>
                </Table.Cell>
                <Table.Cell>
                  <Editable.Root
                    value={sourceValue}
                    onValueChange={(details) =>
                      setSourceEdits((prev) => ({ ...prev, [index]: details.value }))
                    }
                  >
                    <Editable.Preview />
                    <Editable.Input aria-label={`fonte linha ${index}`} />
                  </Editable.Root>
                </Table.Cell>
                <Table.Cell>{row.type}</Table.Cell>
                <Table.Cell textAlign="right">{formatCurrency(row.amount)}</Table.Cell>
              </Table.Row>
            );
          })}

          {future.length > 0 && (
            <>
              <Table.Row>
                <Table.Cell colSpan={7} bg="blue.50" py={2}>
                  <Text fontWeight="semibold" color="blue.700" fontSize="sm">
                    Próximas parcelas (informativo — não serão importadas)
                  </Text>
                </Table.Cell>
              </Table.Row>
              {future.map((row, index) => (
                <Table.Row key={`future-${index}`} bg="blue.50">
                  <Table.Cell />
                  <Table.Cell>{row.date}</Table.Cell>
                  <Table.Cell>{row.description}</Table.Cell>
                  <Table.Cell>{row.category}</Table.Cell>
                  <Table.Cell>{row.source}</Table.Cell>
                  <Table.Cell>EXP</Table.Cell>
                  <Table.Cell textAlign="right">{formatCurrency(row.amount)}</Table.Cell>
                </Table.Row>
              ))}
            </>
          )}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
