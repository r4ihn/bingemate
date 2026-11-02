import { z } from 'zod';

const body = z.string().trim().min(1, 'Write something before saving').max(2000);

export const replyBodySchema = z.object({ body }).strict();

export const replyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const reviewIdParamSchema = z.object({ reviewId: z.string().min(1).max(40) });
export const replyIdParamSchema = z.object({ id: z.string().min(1).max(40) });

export type ReplyBodyInput = z.infer<typeof replyBodySchema>;
