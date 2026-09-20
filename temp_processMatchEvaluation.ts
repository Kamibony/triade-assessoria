async function processMatchEvaluation(oscId: string, editalId: string, forceRecalculate: boolean = false) {
    const db = getFirestore();

    // Fetch OSC and Edital
    const oscDoc = await db.collection('oscs').doc(oscId).get();
    const editalDoc = await db.collection('editais').doc(editalId).get();

    if (!oscDoc.exists || !editalDoc.exists) {
        throw new Error(`OSC (${oscId}) or Edital (${editalId}) not found`);
    }

    const rawOscData = oscDoc.data();
    const rawEditalData = editalDoc.data();

    // Fix 4: Dirty Data Resilience (use safeParse)
    // Map sparse mass-imported data with valid defaults before parsing
    const enrichedOscData = {
        name: rawOscData?.name || 'ONG Desconhecida',
        foundationDate: rawOscData?.foundationDate || 'Data Desconhecida',
        location: rawOscData?.location || 'Localização Desconhecida',
        documentationStatus: rawOscData?.documentationStatus || 'Pendente',
        previousProjectsApproved: rawOscData?.previousProjectsApproved || false,
        coreActivities: rawOscData?.coreActivities || [],
        ...rawOscData
    };

    const oscParseResult = ngoProfileSchema.safeParse(enrichedOscData);
    const editalParseResult = editalSchema.safeParse(rawEditalData);

    // Helper for safe timestamp extraction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getMillis = (field: any): number | null => {
        if (!field) return null;
        if (typeof field.toMillis === 'function') return field.toMillis();
        if (field instanceof Date) return field.getTime();
        if (typeof field === 'string' || typeof field === 'number') {
            const date = new Date(field);
            if (!isNaN(date.getTime())) return date.getTime();
        }
        return null;
    };

    // Upsert strategy: fixed ID to prevent duplicates
    const matchId = `${oscId}_${editalId}`;
    const matchRef = db.collection('matches').doc(matchId);

    const existingMatchDoc = await matchRef.get();
    let existingMatchData: Record<string, unknown> | null = existingMatchDoc.exists ? existingMatchDoc.data() || null : null;

    if (!oscParseResult.success) {
        console.warn(`Invalid OSC data for ${oscId} (Writing Incomplete Profile match safely):`, oscParseResult.error);
        const incompleteMatchDoc = {
            id: matchRef.id,
            oscId: oscId,
            editalId: editalId,
            oscName: enrichedOscData.name || 'ONG Desconhecida',
            editalTitle: rawEditalData?.title || 'Edital Desconhecido',
            sourceUrl: rawEditalData?.sourceUrl || null,
            createdAt: FieldValue.serverTimestamp(),
            matchScore: 0,
            eligibility: true,
            status: 'Pendente (Dados Incompletos)',
            badges: ['Pendente de Informação', 'Perfil Incompleto'],
            aiSummary: 'A avaliação está pendente porque os dados da OSC estão incompletos.',
            reasoning: null,
            actionPlan: ['Atualize os dados do perfil da OSC para permitir a avaliação de match.']
        };
        await matchRef.withConverter(matchConverter).set(incompleteMatchDoc, { merge: true });
        return incompleteMatchDoc;
    }
    if (!editalParseResult.success) {
        console.warn(`Invalid Edital data for ${editalId} (Skipping match safely):`, editalParseResult.error);
        return null;
    }

    const oscData = oscParseResult.data;
    const editalData = editalParseResult.data;


    // Fix 6: Robust timestamp validation for caching
    let shouldRecalculate = forceRecalculate;

    if (!shouldRecalculate && existingMatchData) {
        if (existingMatchData.createdAt) {
            const matchTime = getMillis(existingMatchData.createdAt);
            const oscUpdateTime = getMillis(rawOscData?.updatedAt) || getMillis(rawOscData?.createdAt) || 0;
            const editalUpdateTime = getMillis(rawEditalData?.updatedAt) || getMillis(rawEditalData?.createdAt) || 0;

            // If we can't reliably determine any timestamp, force recalculation
            if (matchTime === null) {
                shouldRecalculate = true;
            } else if (matchTime >= oscUpdateTime && matchTime >= editalUpdateTime) {
                console.log(`Returning cached match for OSC ${oscId} and Edital ${editalId}`);
                return existingMatchData;
            } else {
                // Cache is stale
                shouldRecalculate = true;
            }
        } else {
            // Missing createdAt timestamp
            shouldRecalculate = true;
        }

        // Even if stale, do not recalculate firmly rejected items unless explicitly forced
        if (!forceRecalculate && shouldRecalculate && (
            (typeof existingMatchData.status === 'string' && existingMatchData.status.includes('Inelegível')) ||
            existingMatchData.actionState === 'Rejeitado' ||
            existingMatchData.status === 'Fora do Escopo'
        )) {
             console.log(`Skipping recalculation for firmly rejected match OSC ${oscId} and Edital ${editalId}`);
             shouldRecalculate = false;
        }
    } else if (!existingMatchData) {
        shouldRecalculate = true;
    }

    if (!shouldRecalculate) {
        return existingMatchData;
    }

    console.log(`Evaluating match for OSC ${oscId} and Edital ${editalId}`);

    // Vector Pre-filtering
    let oscEmbedding = rawOscData?.embedding || null;
    let editalEmbedding = rawEditalData?.embedding || null;

    if (!oscEmbedding) {
        console.log(`Generating missing embedding for OSC ${oscId}`);
        const oscText = `Missão: ${oscData.mission || ''}. Foco: ${(oscData.coreActivities || []).join(', ')}. Nome: ${oscData.name || ''}`;
        oscEmbedding = await generateTextEmbedding(oscText);
        await db.collection('oscs').doc(oscId).withConverter(oscConverter).update({ embedding: oscEmbedding });
        oscData.embedding = oscEmbedding;
    }

    if (!editalEmbedding) {
        console.log(`Generating missing embedding for Edital ${editalId}`);
        const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${(editalData.eligibilityCriteria?.allowedActivities || []).join(', ')}.`;
        editalEmbedding = await generateTextEmbedding(editalText);
        await db.collection('editais').doc(editalId).withConverter(editalConverter).update({ embedding: editalEmbedding });
        editalData.embedding = editalEmbedding;
    }

    const similarityScore = cosineSimilarity(oscEmbedding, editalEmbedding);
    console.log(`Vector similarity score for OSC ${oscId} and Edital ${editalId}: ${similarityScore}`);

    let matchResult: unknown;

    // Dynamically adjust pre-filter threshold based on profile density to avoid false negatives for sparse data
    const isSparseProfile = (!oscData.mission || oscData.mission.length < 20) && (oscData.coreActivities.length <= 2);
    const dynamicThreshold = isSparseProfile ? 0.25 : 0.30;

    if (similarityScore < dynamicThreshold) {
        console.log(`Silently rejecting match for OSC ${oscId} and Edital ${editalId} due to low similarity score (${similarityScore} < ${dynamicThreshold})`);
        matchResult = {
            matchScore: 0,
            eligibility: false,
            status: 'Fora do Escopo',
            badges: ['Baixa Relevância (Filtro)'],
            aiSummary: 'A avaliação foi interrompida devido à baixa similaridade semântica entre a ONG e o Edital.',
            reasoning: null
        };
    } else {
        // Deterministic Date Guardrail
        const currentDate = new Date().toISOString().split('T')[0]!;

        let isExpired = false;
        if (!editalData.isContinuous) {
            if (editalData.deadline) {
                isExpired = editalData.deadline < currentDate || editalData.deadline === '1970-01-01';
            } else {
                // If there's no deadline and it's not continuous, we might treat it as expired or skip this check.
                // It's safer to not forcefully expire it here without a date, but let the LLM evaluate if needed.
                // However, matching the previous logic: if deadline is null/undefined and not continuous, it could fail.
                // Since the previous schema enforced a string, it was never null before our change.
                isExpired = false;
            }
        }

        if (isExpired) {
            console.log(`Silently rejecting match for OSC ${oscId} and Edital ${editalId} due to expired deadline (${editalData.deadline})`);
            matchResult = {
                matchScore: 0,
                eligibility: false,
                status: 'Inelegível',
                badges: ['Restrição Burocrática'],
                aiSummary: 'A ONG não atende aos requisitos burocráticos do edital (prazos, localização ou idade).',
                reasoning: 'Edital expirado. O prazo já foi encerrado.',
                actionPlan: null
            };
        } else {
            // Multi-Agent Pipeline
            console.log(`Similarity passed (${similarityScore}). Invoking Bureaucracy Agent...`);
            try {
                const bureaucracyResult = await bureaucracyAgentFlow({
                    osc: oscData,
                    edital: editalData
                });

                if (!bureaucracyResult.passesBureaucracy && !bureaucracyResult.rejectionReason?.toLowerCase().includes('pendente')) {
                    console.log(`Bureaucracy Agent rejected match: ${bureaucracyResult.rejectionReason}`);
                    matchResult = {
                        matchScore: 0,
                        eligibility: false,
                        status: 'Inelegível',
                        badges: ['Restrição Burocrática'],
                        aiSummary: 'A ONG não atende aos requisitos burocráticos do edital (prazos, localização ou idade).',
                        reasoning: bureaucracyResult.rejectionReason,
                        actionPlan: null
                    };
                } else {
                    console.log(`Bureaucracy Agent passed. Invoking Thematic Agent...`);
                    matchResult = await thematicAgentFlow({
                        osc: oscData,
                        edital: editalData,
                        oscId: oscId,
                        editalId: editalId
                    });

                    const typedMatchResult = matchResult as any;

                    // State Preservation for "Pendente" from Bureaucracy
                    if (!bureaucracyResult.passesBureaucracy || bureaucracyResult.rejectionReason?.toLowerCase().includes('pendente')) {
                        typedMatchResult.status = 'Pendente de Informação';
                        if (!typedMatchResult.badges) typedMatchResult.badges = [];
                        if (!typedMatchResult.badges.includes('Pendente de Informação')) {
                            typedMatchResult.badges.push('Pendente de Informação');
                        }
                        if (bureaucracyResult.rejectionReason) {
                            typedMatchResult.reasoning = typedMatchResult.reasoning
                                ? `${bureaucracyResult.rejectionReason}\n\nAlém disso: ${typedMatchResult.reasoning}`
                                : bureaucracyResult.rejectionReason;
                        }
                    }

                    // Strict Score Thresholding
                    if (typedMatchResult.matchScore < 20) {
                        typedMatchResult.eligibility = false;
                        typedMatchResult.status = 'Incompatibilidade Temática';
                        typedMatchResult.badges = ['Fora do Escopo'];
                    } else if (typedMatchResult.status !== 'Pendente de Informação') {
                        typedMatchResult.status = 'Elegível';
                    }
                }
            } catch (error) {
                console.error(`AI Evaluation failed for OSC ${oscId} and Edital ${editalId}:`, error);
                matchResult = {
                    matchScore: 0,
                    eligibility: false,
                    status: 'Inelegível (Erro no Servidor)',
                    badges: ['Erro'],
                    aiSummary: 'Falha de comunicação com a IA durante a avaliação. O limite de requisições pode ter sido atingido.',
                    reasoning: 'Erro interno ao processar a avaliação. Tente novamente mais tarde.',
                    actionPlan: null
                };
            }
        }
    }

    const matchDocData = {
        ...(matchResult as object),
        id: matchRef.id,
        oscId: oscId,
        editalId: editalId,
        oscName: oscData.name,
        editalTitle: editalData.title,
        sourceUrl: rawEditalData?.sourceUrl || null,
        createdAt: FieldValue.serverTimestamp()
    };

    await matchRef.withConverter(matchConverter).set(matchDocData, { merge: true });
    return matchDocData;
}
}
