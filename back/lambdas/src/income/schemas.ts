import { z } from "zod";

const RecurrenceSchema = z.object({
  frequency: z.enum(["monthly", "weekly"], { message: "Frequency must be 'monthly' or 'weekly'" }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid end date format").optional(),
  occurrences: z.number().int().min(2, "Occurrences must be >= 2").optional(),
}).refine(
  (data) => {
    const hasEnd = data.endDate !== undefined;
    const hasOcc = data.occurrences !== undefined;
    return (hasEnd && !hasOcc) || (!hasEnd && hasOcc);
  },
  { message: "Provide exactly one of 'endDate' or 'occurrences', not both or neither" },
);

export const CreateIncomeSchema = z.object({
  description: z.string().min(1, "Description is required"),
  totalAmount: z.number().positive("Total amount must be positive"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  source: z.string().min(1, "Source is required"),
  category: z.string().min(1, "Category is required"),
  recurrence: RecurrenceSchema.optional(),
});

export type CreateIncomeInput = z.infer<typeof CreateIncomeSchema>;

export const UpdateIncomeSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  source: z.string().min(1, "Source is required"),
  category: z.string().min(1, "Category is required"),
});

export type UpdateIncomeInput = z.infer<typeof UpdateIncomeSchema>;

export const ListIncomeQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .optional(),
  recurring: z.enum(["true", "false"]).optional(),
});

export type ListIncomeQueryInput = z.infer<typeof ListIncomeQuerySchema>;
