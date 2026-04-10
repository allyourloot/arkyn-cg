import type { AuthPluginInterface } from "@plugins/plugin-auth/server";
import type { SaveStatesInterface } from "@plugins/plugin-save-states/server";
import { ensureArkynSaveData, type ArkynSaveData } from "./ArkynSaveData";

export interface ArkynContext {
    getUserId(sessionId: string): string | null;
    getSaveData(sessionId: string): ArkynSaveData | null;
}

export function createArkynContext(
    auth: AuthPluginInterface | null,
    saveStates: SaveStatesInterface | null,
): ArkynContext {
    /** Cache of userId -> already-initialized flag so we only call ensureArkynSaveData once. */
    const initialized = new Set<string>();

    return {
        getUserId(sessionId: string): string | null {
            return auth?.getUserBySessionId(sessionId)?.userId ?? null;
        },

        getSaveData(sessionId: string): ArkynSaveData | null {
            const userId = this.getUserId(sessionId);
            if (!userId || !saveStates) return null;
            if (!saveStates.isLoaded(userId)) return null;

            const raw = saveStates.get<Record<string, unknown>>(userId);
            if (!raw) return null;

            if (!initialized.has(userId)) {
                ensureArkynSaveData(raw);
                initialized.add(userId);
            }
            return raw as unknown as ArkynSaveData;
        },
    };
}
