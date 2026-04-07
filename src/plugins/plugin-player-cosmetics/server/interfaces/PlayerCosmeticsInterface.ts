export type PlayerCosmeticsInterfaceEntry = {
    sessionId: string;
    userId: string;
    loadoutJson: string;
    hairModelUrl: string;
    hairTextureUrl: string;
    skinTextureUrl: string;
};

export type PlayerCosmeticsInterface = {
    getPlayerCosmeticsBySessionId(sessionId: string): PlayerCosmeticsInterfaceEntry | null;
    refreshPlayerCosmetics(sessionId: string): Promise<boolean>;
};
