const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

const oldProsasCatch = `    } catch (e: any) {
        logger.error(\`[Prosas Bulk Discovery] Prosas API fetch failed: \${e.message}\`);
        if (runId) {
            await db.collection('ingestion_runs').doc(runId).update({
                'phases.prosas.status': 'FAILED',
                'phases.prosas.errors': FieldValue.arrayUnion(e.message)
            });
        }
        throw e;
    } finally {`;

const newProsasCatch = `    } catch (e: any) {
        logger.error(\`[Prosas Bulk Discovery] Prosas API fetch failed: \${e.message}\`);
        if (runId) {
            await db.collection('ingestion_runs').doc(runId).update({
                'phases.prosas.status': 'FAILED',
                'phases.prosas.errors': FieldValue.arrayUnion(e.message)
            });
        }
        throw e;
    } finally {`;

// The old one already has this logic and sets status to FAILED.
console.log("Prosas worker already has try/catch setting FAILED status.");
