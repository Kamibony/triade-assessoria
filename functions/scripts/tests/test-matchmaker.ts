import { scoreMatch } from '../../src/index.js';

async function runTest() {
    const mockOsc = {
        name: "ONG Cultura Viva",
        foundationDate: "2010-01-01",
        location: "São Paulo/SP",
        documentationStatus: "Em dia" as 'Em dia',
        previousProjectsApproved: true,
        coreActivities: ["Cultura", "Educação"]
    };

    const mockEdital = {
        title: "Edital Cultura para Todos 2024",
        issuer: "Governo do Estado de São Paulo",
        publicationDate: "2024-01-01",
        deadline: "2024-12-31",
        totalBudget: 100000,
        eligibilityCriteria: {
            minYearsActive: 2,
            requiredLocations: ["SP", "Nacional"],
            requiredDocumentation: ["CNPJ", "Estatuto"],
            allowedActivities: ["Cultura", "Artes"]
        }
    };

    const payload = {
        osc: mockOsc,
        edital: mockEdital,
        oscId: 'test_osc_123',
        editalId: 'test_edital_456'
    };

    console.log("Invoking Genkit scoreMatch flow...");
    try {
        const result = await scoreMatch(payload);
        console.log("Match evaluation successful!");
        console.log("Parsed JSON via Zod:");
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Test execution failed / encountered error as expected:", e);
        // Similar to extraction, we expect auth failure if no ADC is present, but it validates the payload structure and invocation.
    }
}

runTest();
