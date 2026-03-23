import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Heading,
  Input,
  Text,
  Flex,
  NativeSelect,
  Spinner,
  Field,
} from '@chakra-ui/react';
import { z } from 'zod';
import {
  createTransaction,
  getTransaction,
  updateTransaction,
} from '../api/transactions';

const TransactionFormSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  totalAmount: z.number().positive('Amount must be positive'),
  date: z.string().min(1, 'Date is required'),
  type: z.enum(['INC', 'EXP']),
  source: z.string().min(1, 'Source is required'),
  category: z.string().min(1, 'Category is required'),
  installments: z.number().int().min(1).default(1),
});

interface FormState {
  description: string;
  totalAmount: string;
  date: string;
  type: 'INC' | 'EXP';
  source: string;
  category: string;
  installments: string;
}

const initialFormState: FormState = {
  description: '',
  totalAmount: '',
  date: '',
  type: 'EXP',
  source: '',
  category: '',
  installments: '1',
};

type FormErrors = Partial<Record<keyof FormState, string>>;

export function TransactionFormPage(): React.JSX.Element {
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
          type: tx.type,
          source: tx.source,
          category: tx.category,
          installments: '1',
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load transaction';
        setApiError(message);
      } finally {
        setLoadingTransaction(false);
      }
    };

    void fetchTransaction();
  }, [isEditMode, decodedSk]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ): void => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setApiError('');
  };

  const validate = (): boolean => {
    const parsed = TransactionFormSchema.safeParse({
      description: form.description,
      totalAmount: Number(form.totalAmount),
      date: form.date,
      type: form.type,
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
          type: form.type,
          source: form.source,
          category: form.category,
        });
      } else {
        await createTransaction({
          description: form.description,
          totalAmount: Number(form.totalAmount),
          date: form.date,
          type: form.type,
          source: form.source,
          category: form.category,
          installments: Number(form.installments) || 1,
        });
      }
      navigate('/transactions');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingTransaction) {
    return (
      <Flex justify="center" py={10}>
        <Spinner />
      </Flex>
    );
  }

  return (
    <Box p={8} maxW="600px" mx="auto">
      <Heading as="h1" mb={6}>
        {isEditMode ? 'Edit Transaction' : 'New Transaction'}
      </Heading>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <Flex direction="column" gap={4}>
          <Field.Root invalid={!!errors.description}>
            <Field.Label>Description</Field.Label>
            <Input
              name="description"
              value={form.description}
              onChange={handleChange}
            />
            {errors.description && (
              <Field.ErrorText>{errors.description}</Field.ErrorText>
            )}
          </Field.Root>

          <Field.Root invalid={!!errors.totalAmount}>
            <Field.Label>Amount</Field.Label>
            <Input
              name="totalAmount"
              type="number"
              step="0.01"
              value={form.totalAmount}
              onChange={handleChange}
            />
            {errors.totalAmount && (
              <Field.ErrorText>{errors.totalAmount}</Field.ErrorText>
            )}
          </Field.Root>

          <Field.Root invalid={!!errors.date}>
            <Field.Label>Date</Field.Label>
            <Input
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
            />
            {errors.date && (
              <Field.ErrorText>{errors.date}</Field.ErrorText>
            )}
          </Field.Root>

          <Field.Root invalid={!!errors.type}>
            <Field.Label>Type</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                name="type"
                value={form.type}
                onChange={handleChange}
              >
                <option value="EXP">EXP</option>
                <option value="INC">INC</option>
              </NativeSelect.Field>
            </NativeSelect.Root>
            {errors.type && (
              <Field.ErrorText>{errors.type}</Field.ErrorText>
            )}
          </Field.Root>

          <Field.Root invalid={!!errors.source}>
            <Field.Label>Source</Field.Label>
            <Input
              name="source"
              value={form.source}
              onChange={handleChange}
            />
            {errors.source && (
              <Field.ErrorText>{errors.source}</Field.ErrorText>
            )}
          </Field.Root>

          <Field.Root invalid={!!errors.category}>
            <Field.Label>Category</Field.Label>
            <Input
              name="category"
              value={form.category}
              onChange={handleChange}
            />
            {errors.category && (
              <Field.ErrorText>{errors.category}</Field.ErrorText>
            )}
          </Field.Root>

          {!isEditMode && (
            <Field.Root invalid={!!errors.installments}>
              <Field.Label>Installments</Field.Label>
              <Input
                name="installments"
                type="number"
                min="1"
                step="1"
                value={form.installments}
                onChange={handleChange}
              />
              {errors.installments && (
                <Field.ErrorText>{errors.installments}</Field.ErrorText>
              )}
            </Field.Root>
          )}

          {apiError && (
            <Text color="red.500">{apiError}</Text>
          )}

          <Flex gap={4} mt={2}>
            <Button
              type="submit"
              colorPalette="blue"
              loading={submitting}
            >
              {isEditMode ? 'Update' : 'Create'}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/transactions')}
            >
              Cancel
            </Button>
          </Flex>
        </Flex>
      </form>
    </Box>
  );
}
