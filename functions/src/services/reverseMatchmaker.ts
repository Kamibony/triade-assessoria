import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import * as logger from 'firebase-functions/logger';

// Dynamic import to avoid circular dependency
export const triggerReverseMatch = onDocumentCreated('editais/{editalId}', async (event) => {
    // DISABLING AUTOMATIC CASCADE: We are relying entirely on the manual
    // "Gerar Matches para Editais do Período" button in the Caçador dashboard.
    // See request history for details.
    logger.info(`Automatic reverse matchmaker triggered for Edital ${event.params?.editalId} - intentionally disabled.`);
    return;
});
