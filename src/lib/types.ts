import { z } from 'zod';
import { ngoProfileSchema, editalSchema, matchSchema } from '../../functions/src/shared/schemas';

export type NgoProfile = z.infer<typeof ngoProfileSchema> & { id: string };

export type Edital = z.infer<typeof editalSchema> & { id: string };

export type MatchResult = z.infer<typeof matchSchema> & {
    id?: string;
    editalTitle?: string;
    sourceUrl?: string;
    createdAt?: { toMillis?: () => number; seconds?: number; nanoseconds?: number; };
    status?: string;
    verificationResult?: {
        criterion: 'Localização' | 'Prazo' | 'Fundação' | 'Documentação';
        status: 'Aprovado' | 'Reprovado' | 'Pendente de Informação';
        citation: string;
    }[];
};
