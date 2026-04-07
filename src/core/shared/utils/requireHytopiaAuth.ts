export type HytopiaAuth = {
    gameId: string;
    apiKey: string;
};

export function requireHytopiaAuth(): HytopiaAuth {
    const gameId = process.env.HYTOPIA_GAME_ID;
    const apiKey = process.env.HYTOPIA_API_KEY;

    if (!gameId || !apiKey) {
        const missing = [
            !gameId && "HYTOPIA_GAME_ID",
            !apiKey && "HYTOPIA_API_KEY",
        ].filter(Boolean).join(", ");

        throw new Error(
            `Missing environment variable(s): ${missing}. ` +
            `Run "hy login" to authenticate, or add them to your .env file.`,
        );
    }

    return { gameId, apiKey };
}
