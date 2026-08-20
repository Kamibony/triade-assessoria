import { z } from 'zod';
import { ngoProfileSchema, editalSchema, matchSchema } from '../../functions/src/shared/schemas';

export type NgoProfile = z.infer<typeof ngoProfileSchema> & { id: string };

export type Edital = z.infer<typeof editalSchema> & { id: string };

export type MatchResult = z.infer<typeof matchSchema> & {
    id?: string;
    createdAt?: { toMillis?: () => number; seconds?: number; nanoseconds?: number; };
};
