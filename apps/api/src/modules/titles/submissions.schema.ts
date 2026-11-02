import { z } from 'zod';
import { MediaType } from '@bingemate/shared';

export const createSubmissionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    mediaType: z.nativeEnum(MediaType),
    description: z.string().trim().max(5000).optional(),
  })
  .strict();

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const updateSubmissionSchema = createSubmissionSchema
  .pick({ name: true, description: true })
  .partial()
  .strict()
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'Nothing to change',
  });

export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;
