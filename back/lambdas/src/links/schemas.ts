import { z } from "zod";

export const CreateLinkSchema = z.object({
  parentSk: z.string().min(1, "Parent sort key is required"),
  childSk: z.string().min(1, "Child sort key is required"),
}).refine(
  (data) => data.parentSk !== data.childSk,
  { message: "Cannot link an entry to itself" },
);

export type CreateLinkInput = z.infer<typeof CreateLinkSchema>;
