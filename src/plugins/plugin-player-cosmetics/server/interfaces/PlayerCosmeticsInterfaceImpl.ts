import type { PlayerCosmeticsState } from "../../shared";
import type {
    PlayerCosmeticsInterface,
    PlayerCosmeticsInterfaceEntry,
} from "./PlayerCosmeticsInterface";

export class PlayerCosmeticsInterfaceImpl implements PlayerCosmeticsInterface {
    private readonly state: PlayerCosmeticsState;
    private readonly refreshHandler: (sessionId: string) => Promise<boolean>;

    constructor(state: PlayerCosmeticsState, refreshHandler: (sessionId: string) => Promise<boolean>) {
        this.state = state;
        this.refreshHandler = refreshHandler;
    }

    getPlayerCosmeticsBySessionId(sessionId: string): PlayerCosmeticsInterfaceEntry | null {
        const entry = this.state.players.get(sessionId);
        if (!entry) return null;

        return {
            sessionId,
            userId: entry.userId,
            loadoutJson: entry.loadoutJson,
            hairModelUrl: entry.hairModelUrl,
            hairTextureUrl: entry.hairTextureUrl,
            skinTextureUrl: entry.skinTextureUrl,
        };
    }

    refreshPlayerCosmetics(sessionId: string): Promise<boolean> {
        return this.refreshHandler(sessionId);
    }
}
