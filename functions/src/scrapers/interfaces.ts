export interface IScraperStrategy {
    stateDocId: string;
    fetchDelta(): Promise<any[]>;
    extractRaw(item: any): Promise<any>;
    getWatermark(): Promise<string | null>;
}
