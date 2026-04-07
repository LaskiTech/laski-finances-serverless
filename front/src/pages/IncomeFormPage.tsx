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
  createIncome,
  getIncome,
  updateIncome,
} from '../api/income';

const IncomeFormSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  totalAmount: z.number().positive('Amount must be positive'),
  date: z.string().min(1, 'Date is required'),
  source: z.string().min(1, 'Source is required'),
  category: z.string().min(1, 'Category is required'),
});

interface FormState {
  description: string;
  totalAmount: string;
  date: string;
  source: string;
  category: string;
  isRecurring: boolean;
  frequency: 'monthly' | 'weekly';
  recurrenceMode: 'endDate' | 'occurrences';
  endDate: string;
  occurrences: string;
}

const initialFormState: FormState = {
  description: '',
  totalAmount: '',
  date: '',
  source: '',
  category: '',
  isRecurring: false,
  frequency: 'monthly',
  recurrenceMode: 'occurrences',
  endDate: '',
  occurrences: '2',
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const inputStyles = {
  h: "48px",
  borderRadius: "10px",
  borderColor: "#E5E7EB",
  bg: "white",
  fontSize: "sm",
  _hover: { borderColor: "#D1D5DB" },
  _focus: { borderColor: "#00D4AA", boxShadow: "0 0 0 3px rgba(0, 212, 170, 0.1)" },
  transition: "all 0.2s",
} as const;

const labelStyles = {
  fontSize: "sm",
  fontWeight: "500",
  color: "#374151",
  mb: "1",
} as const;

export function IncomeFormPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { sk } = useParams<{ sk: string }>();
  const isEditMode = !!sk;
  const decodedSk = sk ? decodeURIComponent(sk) : '';

  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingIncome, setLoadingIncome] = useState(isEditMode);
  const [isRecurringEntry, setIsRecurringEntry] = useState(false);

  useEffect(() => {
    if (!isEditMode) return;

    const fetchIncome = async (): Promise<void> => {
      try {
        const item = await getIncome(decodedSk);
        setForm({
          description: item.description,
          totalAmount: String(item.amount),
          date: item.date,
          source: item.source,
          category: item.category,
          isRecurring: false,
          frequency: 'monthly',
          recurrenceMode: 'occurrences',
          endDate: '',
          occurrences: '2',
        });
        setIsRecurringEntry(!!item.isRecurring);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load income entry';
        setApiError(message);
      } finally {
        setLoadingIncome(false);
      }
    };

    void fetchIncome();
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
    const parsed = IncomeFormSchema.safeParse({
      description: form.description,
      totalAmount: Number(form.totalAmount),
      date: form.date,
      source: form.source,
      category: form.category,
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
        let updateGroup = false;
        if (isRecurringEntry) {
          updateGroup = window.confirm(
            'Update this and all future entries in this recurring series?',
          );
        }

        await updateIncome(decodedSk, {
          description: form.description,
          amount: Number(form.totalAmount),
          date: form.date,
          source: form.source,
          category: form.category,
        }, updateGroup);
      } else {
        const payload: Parameters<typeof createIncome>[0] = {
          description: form.description,
          totalAmount: Number(form.totalAmount),
          date: form.date,
          source: form.source,
          category: form.category,
        };

        if (form.isRecurring) {
          payload.recurrence = {
            frequency: form.frequency,
            ...(form.recurrenceMode === 'endDate'
              ? { endDate: form.endDate }
              : { occurrences: Number(form.occurrences) || 2 }),
          };
        }

        await createIncome(payload);
      }
      navigate('/transactions?tab=income');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setApiError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingIncome) {
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
        {isEditMode ? 'Edit Income' : 'New Income'}
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
              <Field.Label {...labelStyles}>Description</Field.Label>
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
              <Field.Label {...labelStyles}>Amount</Field.Label>
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
              <Field.Label {...labelStyles}>Date</Field.Label>
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
              <Field.Label {...labelStyles}>Source</Field.Label>
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
              <Field.Label {...labelStyles}>Category</Field.Label>
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
              <>
                <Flex
                  as="label"
                  align="center"
                  gap="2"
                  cursor="pointer"
                  userSelect="none"
                  mt={2}
                >
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, isRecurring: e.target.checked }))
                    }
                    style={{ accentColor: '#00D4AA', width: 16, height: 16 }}
                  />
                  <Text fontSize="sm" fontWeight="500" color="#374151">Recurring income</Text>
                </Flex>

                {form.isRecurring && (
                  <Box
                    bg="#F9FAFB"
                    borderRadius="10px"
                    border="1px solid"
                    borderColor="#E5E7EB"
                    p={4}
                  >
                    <Flex direction="column" gap={3}>
                      <Field.Root>
                        <Field.Label {...labelStyles}>Frequency</Field.Label>
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            name="frequency"
                            value={form.frequency}
                            onChange={handleChange}
                            h="48px"
                            borderRadius="10px"
                            borderColor="#E5E7EB"
                            bg="white"
                            fontSize="sm"
                          >
                            <option value="monthly">Monthly</option>
                            <option value="weekly">Weekly</option>
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      </Field.Root>

                      <Field.Root>
                        <Field.Label {...labelStyles}>Ends by</Field.Label>
                        <NativeSelect.Root>
                          <NativeSelect.Field
                            name="recurrenceMode"
                            value={form.recurrenceMode}
                            onChange={handleChange}
                            h="48px"
                            borderRadius="10px"
                            borderColor="#E5E7EB"
                            bg="white"
                            fontSize="sm"
                          >
                            <option value="occurrences">Number of occurrences</option>
                            <option value="endDate">End date</option>
                          </NativeSelect.Field>
                        </NativeSelect.Root>
                      </Field.Root>

                      {form.recurrenceMode === 'occurrences' ? (
                        <Field.Root>
                          <Field.Label {...labelStyles}>Occurrences</Field.Label>
                          <Input
                            name="occurrences"
                            type="number"
                            min="2"
                            step="1"
                            value={form.occurrences}
                            onChange={handleChange}
                            {...inputStyles}
                          />
                        </Field.Root>
                      ) : (
                        <Field.Root>
                          <Field.Label {...labelStyles}>End date</Field.Label>
                          <Input
                            name="endDate"
                            type="date"
                            value={form.endDate}
                            onChange={handleChange}
                            {...inputStyles}
                          />
                        </Field.Root>
                      )}
                    </Flex>
                  </Box>
                )}
              </>
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
                _hover={{ bg: "#162038" }}
              >
                {isEditMode ? 'Update' : 'Create'}
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
                _hover={{ bg: "#F9FAFB", borderColor: "#D1D5DB" }}
                onClick={() => navigate('/transactions?tab=income')}
              >
                Cancel
              </Button>
            </Flex>
          </Flex>
        </form>
      </Box>
    </Box>
  );
}
