import { z } from "zod";

// --- Create Transaction Schema (extracted from create-transaction.ts) ---

export const CreateTransactionSchema = z.object({
  description: z.string().min(1, "Description is required"),
  totalAmount: z.number().positive("Total amount must be positive"),
  installments: z.number().int().min(1, "Installments must be an integer >= 1").default(1),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  category: z.string().min(1, "Category is required"),
  source: z.string().min(1, "Source is required"),
  type: z.enum(["INC", "EXP"], { message: "Invalid transaction type. Must be INC or EXP" }),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

// --- Update Transaction Schema (no installments field) ---

export const UpdateTransactionSchema = z.object({
  description: z.string().min(1, "Description is required"),
  amount: z.number().positive("Amount must be positive"),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid date format"),
  type: z.enum(["INC", "EXP"], { message: "Invalid transaction type. Must be INC or EXP" }),
  source: z.string().min(1, "Source is required"),
  category: z.string().min(1, "Category is required"),
});

export type UpdateTransactionInput = z.infer<typeof UpdateTransactionSchema>;

// --- List Query Schema (optional month and type filters) ---

export const ListQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format")
    .optional(),
  type: z.enum(["INC", "EXP"], { message: "Type must be INC or EXP" }).optional(),
});

export type ListQueryInput = z.infer<typeof ListQuerySchema>;
