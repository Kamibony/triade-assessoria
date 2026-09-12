const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const search = `export const computeDashboardStats = onCall({
    cors: true,
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '512MiB',
}, async (request) => {
    const db = getFirestore();
    try {
        const matchesSnapshot = await db.collection('matches').get();
        const matches = matchesSnapshot.docs.map(d => d.data());

        const total = matches.length;
        const aiApproved = matches.filter(m => m.eligibility === true).length;
        const manuallyApproved = matches.filter(m => m.actionState === 'Aprovado').length;
        const pendentes = matches.filter(m => (!m.actionState && m.eligibility !== false) || m.actionState === 'Pendente').length;
        const reprovados = matches.filter(m => m.actionState === 'Rejeitado' || (!m.actionState && m.eligibility === false)).length;

        const hotLeadsMap: Record<string, number> = {};
        matches.filter(m => m.matchScore >= 80).forEach(m => {
            hotLeadsMap[m.oscId] = (hotLeadsMap[m.oscId] || 0) + 1;
        });

        const validEditalMatches = matches.filter(m => m.eligibility !== false);
        const editalCountMap: Record<string, number> = {};
        validEditalMatches.forEach(m => {
            editalCountMap[m.editalId] = (editalCountMap[m.editalId] || 0) + 1;
        });

        const tagCountMap: Record<string, number> = {};
        matches.filter(m => m.eligibility === true).forEach(m => {
            if (m.badges && Array.isArray(m.badges)) {
                m.badges.forEach((badge: string) => {
                    tagCountMap[badge] = (tagCountMap[badge] || 0) + 1;
                });
            }
        });

        return { total, aiApproved, manuallyApproved, pendentes, reprovados, hotLeadsMap, editalCountMap, tagCountMap };
    } catch (error) {
        console.error("Error computing dashboard stats", error);
        throw new HttpsError("internal", "Failed to compute stats");
    }
});`;

const replace = `export const recalculateDashboardStats = onRequest({
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB',
}, async (req, res) => {
    const db = getFirestore();
    try {
        const matchesSnapshot = await db.collection('matches').get();
        const matches = matchesSnapshot.docs.map(d => d.data());

        const total = matches.length;
        const aiApproved = matches.filter(m => m.eligibility === true).length;
        const manuallyApproved = matches.filter(m => m.actionState === 'Aprovado').length;
        const pendentes = matches.filter(m => (!m.actionState && m.eligibility !== false) || m.actionState === 'Pendente').length;
        const reprovados = matches.filter(m => m.actionState === 'Rejeitado' || (!m.actionState && m.eligibility === false)).length;

        const hotLeadsMap: Record<string, number> = {};
        matches.filter(m => m.matchScore >= 80).forEach(m => {
            hotLeadsMap[m.oscId] = (hotLeadsMap[m.oscId] || 0) + 1;
        });

        const validEditalMatches = matches.filter(m => m.eligibility !== false);
        const editalCountMap: Record<string, number> = {};
        validEditalMatches.forEach(m => {
            editalCountMap[m.editalId] = (editalCountMap[m.editalId] || 0) + 1;
        });

        const tagCountMap: Record<string, number> = {};
        matches.filter(m => m.eligibility === true).forEach(m => {
            if (m.badges && Array.isArray(m.badges)) {
                m.badges.forEach((badge: string) => {
                    tagCountMap[badge] = (tagCountMap[badge] || 0) + 1;
                });
            }
        });

        const stats = {
            total,
            aiApproved,
            manuallyApproved,
            pendentes,
            reprovados,
            hotLeadsMap,
            editalCountMap,
            tagCountMap,
            updatedAt: FieldValue.serverTimestamp()
        };

        await db.collection('system_metadata').doc('dashboard_stats').set(stats);

        res.status(200).json({ success: true, message: "Dashboard stats recalculated successfully", stats });
    } catch (error) {
        console.error("Error computing dashboard stats", error);
        res.status(500).json({ success: false, error: "Failed to compute stats" });
    }
});`;

content = content.replace(search, replace);
fs.writeFileSync('functions/src/index.ts', content);
console.log('done');
