const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const targetStr = `        const { searchId, target, query, page = 1, linksQueue = [], runId } = request.data as { searchId: string, target: any, query?: string, page?: number, linksQueue?: string[], runId?: string };`;
const replacementStr = `        const { searchId, target, query, page = 1, linksQueue = [], runId, consecutiveZeroNewCount = 0 } = request.data as { searchId: string, target: any, query?: string, page?: number, linksQueue?: string[], runId?: string, consecutiveZeroNewCount?: number };`;

content = content.replace(targetStr, replacementStr);

const enqueueNextPage = `        } else if (candidateLinks.length > 0 && target.strategy !== 'RSS' && page < 5) {
            // Finished current page's links, fetch next page
            await queue.enqueue({
                searchId,
                target,
                query,
                page: page + 1,
                linksQueue: [],
                runId
            });
        }`;

// We want to pass consecutiveZeroNewCount and only enqueue if < 2
const newEnqueueNextPage = `        } else if (target.strategy !== 'RSS' && page < 5) {
            let nextConsecutiveZeroNewCount = consecutiveZeroNewCount;
            // If we processed links but none were successful, increment. Otherwise, reset if we had successes.
            // But wait, candidateLinks might be empty, which means no new links found on the page.
            if (candidateLinks.length === 0 || totalProcessed === 0) {
                 nextConsecutiveZeroNewCount++;
            } else {
                 nextConsecutiveZeroNewCount = 0;
            }

            if (nextConsecutiveZeroNewCount < 2) {
                await queue.enqueue({
                    searchId,
                    target,
                    query,
                    page: page + 1,
                    linksQueue: [],
                    runId,
                    consecutiveZeroNewCount: nextConsecutiveZeroNewCount
                });
            } else {
                logger.info(\`[Scraper] Stopping pagination for \${target.name}. Found 2 consecutive pages with 0 new links.\`);
                if (searchRef) {
                    await searchRef.update({
                        completedTargets: FieldValue.increment(1)
                    });
                }
                if (runId) {
                    await db.collection('ingestion_runs').doc(runId).update({
                        'phases.internalFontes.targetsProcessed': FieldValue.increment(1)
                    });

                    const runDoc = await db.collection('ingestion_runs').doc(runId).get();
                    const runData = runDoc.data();
                    if (runData && runData.phases && runData.phases.internalFontes) {
                        if (runData.phases.internalFontes.targetsProcessed >= runData.phases.internalFontes.totalTargets) {
                            await db.collection('ingestion_runs').doc(runId).update({
                                'phases.internalFontes.status': 'COMPLETED'
                            });
                            await checkAndUpdateGlobalRunStatus(runId);
                        }
                    }
                }
            }
        }`;

content = content.replace(enqueueNextPage, newEnqueueNextPage);

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
