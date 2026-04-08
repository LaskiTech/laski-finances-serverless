import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Heading,
  Input,
  Text,
  Flex,
  Spinner,
  Field,
} from '@chakra-ui/react';
import { z } from 'zod';
import {
  createTransaction,
  getTransaction,
  updateTransaction,
} from '../api/transactions';

const ExpenseFormSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória'),
  totalAmount: z.number().positive('Valor deve ser positivo'),
  date: z.string().min(1, 'Data obrigatória'),
  source: z.string().min(1, 'Fonte obrigatória'),
  category: z.string().min(1, 'Categoria obrigatória'),
  installments: z.number().int().min(1).default(1),
});

interface FormState {
  description: string;
  totalAmount: string;
  date: string;
  source: string;
  category: string;
  installments: string;
}

const initialFormState: FormState = {
  description: '',
  totalAmount: '',
  date: '',
  source: '',
  category: '',
  installments: '1',
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const inputStyles = {
  h: '48px',
  borderRadius: '10px',
  borderColor: '#E5E7EB',
  bg: 'white',
  fontSize: 'sm',
  _hover: { borderColor: '#D1D5DB' },
  _focus: { borderColor: '#00D4AA', boxShadow: '0 0 0 3px rgba(0, 212, 170, 0.1)' },
  transition: 'all 0.2s',
} as const;

const labelStyles = {
  fontSize: 'sm',
  fontWeight: '500',
  color: '#374151',
  mb: '1',
} as const;

export function ExpenseFormPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { sk } = useParams<{ sk: string }>();
  const isEditMode = !!sk;
  const decodedSk = sk ? decodeURIComponent(sk) : '';

  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingTransaction, setLoadingTransaction] = useState(isEditMode);

  useEffect(() => {
    if (!isEditMode) return;

    const fetchTransaction = async (): Promise<void> => {
      try {
        const tx = await getTransaction(decodedSk);
        setForm({
          description: tx.description,
          totalAmount: String(tx.amount),
          date: tx.date,
          source: tx.source,
          category: tx.category,
          installments: '1',
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Falha ao carregar despesa';
        setApiError(message);
      } finally {
        setLoadingTransaction(false);
      }
    };

    void fetchTransaction();
  }, [isEditMode, decodedSk]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setApiError('');
  };

  const validate = (): boolean => {
    const parsed = ExpenseFormSchema.safeParse({
      description: form.description,
      totalAmount: Number(form.totalAmount),
      date: form.date,
      source: form.source,
      category: form.category,
      installments: Number(form.installments) || 1,
    });

    if (parsed.success) {
      setErrors({});
      return true;
    }

    const fieldErrors: FormErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FormState | undefined;
      if (field && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    setErrors(fieldErrors);
    return false;
  };

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setApiError('');

    try {
      if (isEditMode) {
        await updateTransaction(decodedSk, {
          description: form.description,
          amount: Number(form.totalAmount),
          date: form.date,
          type: 'EXP',
          source: form.source,
          category: form.category,
        });
      } else {
        await createTransaction({
          description: form.description,
          totalAmount: Number(form.totalAmount),
          date: form.date,
          type: 'EXP',
          source: form.source,
          category: form.category,
          installments: Number(form.installments) || 1,
        });
      }
      navigate('/transactions?tab=expenses');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Ocorreu um erro inesperado';
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const installmentCount = Number(form.installments) || 1;
  const totalAmount = Number(form.totalAmount) || 0;
  const installmentValue =
    installmentCount > 1 && totalAmount > 0
      ? totalAmount / installmentCount
      : null;

  if (loadingTransaction) {
    return (
      <Flex justify="center" py={16}>
        <Spinner color="#00D4AA" size="lg" />
      </Flex>
    );
  }

  return (
    <Box p={{ base: 5, md: 8 }} maxW="600px" mx="auto">
      <Heading
        as="h1"
        fontSize="2xl"
        fontWeight="700"
        color="#0B1426"
        letterSpacing="-0.02em"
        mb={6}
      >
        {isEditMode ? 'Editar despesa' : 'Nova despesa'}
      </Heading>

      <Box
        bg="white"
        borderRadius="14px"
        border="1px solid"
        borderColor="#E5E7EB"
        p={6}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <Flex direction="column" gap={4}>
            <Field.Root invalid={!!errors.description}>
              <Field.Label {...labelStyles}>Descrição</Field.Label>
              <Input
                name="description"
                value={form.description}
                onChange={handleChange}
                {...inputStyles}
              />
              {errors.description && (
                <Field.ErrorText fontSize="xs">{errors.description}</Field.ErrorText>
              )}
            </Field.Root>

            <Field.Root invalid={!!errors.totalAmount}>
              <Field.Label {...labelStyles}>Valor total</Field.Label>
              <Input
                name="totalAmount"
                type="number"
                step="0.01"
                value={form.totalAmount}
                onChange={handleChange}
                {...inputStyles}
              />
              {errors.totalAmount && (
                <Field.ErrorText fontSize="xs">{errors.totalAmount}</Field.ErrorText>
              )}
            </Field.Root>

            <Field.Root invalid={!!errors.date}>
              <Field.Label {...labelStyles}>Data</Field.Label>
              <Input
                name="date"
                type="date"
                value={form.date}
                onChange={handleChange}
                {...inputStyles}
              />
              {errors.date && (
                <Field.ErrorText fontSize="xs">{errors.date}</Field.ErrorText>
              )}
            </Field.Root>

            <Field.Root invalid={!!errors.source}>
              <Field.Label {...labelStyles}>Fonte</Field.Label>
              <Input
                name="source"
                value={form.source}
                onChange={handleChange}
                {...inputStyles}
              />
              {errors.source && (
                <Field.ErrorText fontSize="xs">{errors.source}</Field.ErrorText>
              )}
            </Field.Root>

            <Field.Root invalid={!!errors.category}>
              <Field.Label {...labelStyles}>Categoria</Field.Label>
              <Input
                name="category"
                value={form.category}
                onChange={handleChange}
                {...inputStyles}
              />
              {errors.category && (
                <Field.ErrorText fontSize="xs">{errors.category}</Field.ErrorText>
              )}
            </Field.Root>

            {!isEditMode && (
              <Field.Root invalid={!!errors.installments}>
                <Field.Label {...labelStyles}>Parcelas</Field.Label>
                <Input
                  name="installments"
                  type="number"
                  min="1"
                  step="1"
                  value={form.installments}
                  onChange={handleChange}
                  {...inputStyles}
                />
                {installmentValue !== null && (
                  <Text fontSize="xs" color="#6B7280" mt="1">
                    O valor será dividido em {installmentCount} parcelas mensais de{' '}
                    {installmentValue.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}{' '}
                    cada.
                  </Text>
                )}
                {errors.installments && (
                  <Field.ErrorText fontSize="xs">{errors.installments}</Field.ErrorText>
                )}
              </Field.Root>
            )}

            {apiError && (
              <Box
                bg="#FEF2F2"
                color="#DC2626"
                border="1px solid"
                borderColor="#FECACA"
                p="3"
                borderRadius="10px"
                fontSize="sm"
              >
                {apiError}
              </Box>
            )}

            <Flex gap={3} mt={2}>
              <Button
                type="submit"
                flex="1"
                h="48px"
                bg="#0B1426"
                color="white"
                fontWeight="600"
                fontSize="sm"
                borderRadius="10px"
                loading={submitting}
                _hover={{ bg: '#162038' }}
              >
                {isEditMode ? 'Atualizar' : 'Criar'}
              </Button>
              <Button
                flex="1"
                h="48px"
                variant="outline"
                fontWeight="500"
                fontSize="sm"
                borderRadius="10px"
                borderColor="#E5E7EB"
                color="#374151"
                _hover={{ bg: '#F9FAFB', borderColor: '#D1D5DB' }}
                onClick={() => navigate('/transactions?tab=expenses')}
              >
                Cancelar
              </Button>
            </Flex>
          </Flex>
        </form>
      </Box>
    </Box>
  );
}
