export type SaveStatesInterface = {
    get<T>(userId: string): T | null;
    getVersion(userId: string): number;
    isLoaded(userId: string): boolean;
};
