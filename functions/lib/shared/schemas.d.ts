import { z } from 'zod';
export declare const ngoProfileSchema: z.ZodObject<{
    name: z.ZodString;
    cnpj: z.ZodOptional<z.ZodString>;
    mission: z.ZodOptional<z.ZodString>;
    boardValidity: z.ZodOptional<z.ZodString>;
    foundationDate: z.ZodString;
    location: z.ZodString;
    documentationStatus: z.ZodEnum<["Em dia", "Pendente", "Irregular"]>;
    previousProjectsApproved: z.ZodBoolean;
    coreActivities: z.ZodArray<z.ZodString, "many">;
    embedding: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    name: string;
    cnpj?: string | undefined;
    mission?: string | undefined;
    boardValidity?: string | undefined;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
    embedding?: any;
}, {
    name: string;
    cnpj?: string | undefined;
    mission?: string | undefined;
    boardValidity?: string | undefined;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
    embedding?: any;
}>;
export declare const editalSchema: z.ZodObject<{
    title: z.ZodString;
    issuer: z.ZodString;
    publicationDate: z.ZodString;
    deadline: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isContinuous: z.ZodDefault<z.ZodBoolean>;
    ativo: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    totalBudget: z.ZodNumber;
    eligibilityCriteria: z.ZodObject<{
        minYearsActive: z.ZodNumber;
        requiredLocations: z.ZodArray<z.ZodString, "many">;
        requiredDocumentation: z.ZodArray<z.ZodString, "many">;
        allowedActivities: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        minYearsActive: number;
        requiredLocations: string[];
        requiredDocumentation: string[];
        allowedActivities: string[];
    }, {
        minYearsActive: number;
        requiredLocations: string[];
        requiredDocumentation: string[];
        allowedActivities: string[];
    }>;
    embedding: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    title: string;
    issuer: string;
    publicationDate: string;
    deadline?: string | null | undefined;
    isContinuous: boolean;
    ativo: boolean;
    totalBudget: number;
    eligibilityCriteria: {
        minYearsActive: number;
        requiredLocations: string[];
        requiredDocumentation: string[];
        allowedActivities: string[];
    };
    embedding?: any;
}, {
    title: string;
    issuer: string;
    publicationDate: string;
    deadline?: string | null | undefined;
    isContinuous?: boolean | undefined;
    ativo?: boolean | undefined;
    totalBudget: number;
    eligibilityCriteria: {
        minYearsActive: number;
        requiredLocations: string[];
        requiredDocumentation: string[];
        allowedActivities: string[];
    };
    embedding?: any;
}>;
export declare const bureaucracySchema: z.ZodObject<{
    passesBureaucracy: z.ZodBoolean;
    rejectionReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    passesBureaucracy: boolean;
    rejectionReason?: string | null | undefined;
}, {
    passesBureaucracy: boolean;
    rejectionReason?: string | null | undefined;
}>;
export declare const verificationResultSchema: z.ZodArray<z.ZodObject<{
    criterion: z.ZodString;
    status: z.ZodEnum<["Aprovado", "Reprovado", "Não Encontrado"]>;
    citation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    criterion: string;
    status: "Aprovado" | "Não Encontrado" | "Reprovado";
    citation: string;
}, {
    criterion: string;
    status: "Aprovado" | "Não Encontrado" | "Reprovado";
    citation: string;
}>, "many">;
export declare const matchSchema: z.ZodObject<{
    editalId: z.ZodString;
    oscId: z.ZodString;
    oscName: z.ZodOptional<z.ZodString>;
    matchScore: z.ZodNumber;
    eligibility: z.ZodBoolean;
    reasoning: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    aiSummary: z.ZodOptional<z.ZodString>;
    badges: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    actionPlan: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    actionState: z.ZodDefault<z.ZodOptional<z.ZodEnum<["Pendente", "Aprovado", "Rejeitado", "Revisao"]>>>;
    verificationResult: z.ZodOptional<z.ZodArray<z.ZodObject<{
        criterion: z.ZodString;
        status: z.ZodEnum<["Aprovado", "Reprovado", "Não Encontrado"]>;
        citation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        criterion: string;
        status: "Aprovado" | "Não Encontrado" | "Reprovado";
        citation: string;
    }, {
        criterion: string;
        status: "Aprovado" | "Não Encontrado" | "Reprovado";
        citation: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    editalId: string;
    oscId: string;
    oscName?: string | undefined;
    matchScore: number;
    eligibility: boolean;
    reasoning?: string | null | undefined;
    aiSummary?: string | undefined;
    badges?: string[] | undefined;
    actionPlan?: string[] | undefined;
    actionState: "Aprovado" | "Pendente" | "Rejeitado" | "Revisao";
    verificationResult?: {
        criterion: string;
        status: "Aprovado" | "Não Encontrado" | "Reprovado";
        citation: string;
    }[] | undefined;
}, {
    editalId: string;
    oscId: string;
    oscName?: string | undefined;
    matchScore: number;
    eligibility: boolean;
    reasoning?: string | null | undefined;
    aiSummary?: string | undefined;
    badges?: string[] | undefined;
    actionPlan?: string[] | undefined;
    actionState?: "Aprovado" | "Pendente" | "Rejeitado" | "Revisao" | undefined;
    verificationResult?: {
        criterion: string;
        status: "Aprovado" | "Não Encontrado" | "Reprovado";
        citation: string;
    }[] | undefined;
}>;
export declare const triageSchema: z.ZodObject<{
    isValidEdital: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    isValidEdital: boolean;
}, {
    isValidEdital: boolean;
}>;
export declare const copilotResponseSchema: z.ZodObject<{
    matchedOscs: z.ZodArray<z.ZodObject<{
        oscId: z.ZodString;
        name: z.ZodString;
        location: z.ZodString;
        coreActivities: z.ZodArray<z.ZodString, "many">;
        reasoning: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }, {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }>, "many">;
    outreachMessage: z.ZodString;
    explanation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    matchedOscs: {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }[];
    outreachMessage: string;
    explanation: string;
}, {
    matchedOscs: {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }[];
    outreachMessage: string;
    explanation: string;
}>;
export declare const scrapingTargetSchema: z.ZodObject<{
    name: z.ZodString;
    url: z.ZodString;
    strategy: z.ZodEnum<["RSS", "API", "HTML"]>;
    cssSelector: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    url: string;
    strategy: "API" | "HTML" | "RSS";
    cssSelector?: string | undefined;
}, {
    name: string;
    url: string;
    strategy: "API" | "HTML" | "RSS";
    cssSelector?: string | undefined;
}>;
//# sourceMappingURL=schemas.d.ts.map