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
