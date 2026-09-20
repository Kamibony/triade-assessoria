export interface IScraperStrategy {
    fetchDelta(): Promise<any[]>;
    extractRaw(item: any): Promise<any>;
    getWatermark(): Promise<string | null>;
}
