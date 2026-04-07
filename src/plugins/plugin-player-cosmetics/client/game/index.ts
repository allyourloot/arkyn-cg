import type { ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { SimplePlayerRendererInterface } from "@hytopia.com/neo-plugin-simple-player-renderer/client";
import type { PlayerCosmeticsState } from "../../shared";
import {
    COSMETIC_SLOT_NAMES,
    applySkinTextureToPlayer,
    applyCosmeticFlags,
    attachHairToPlayer,
    attachCosmeticToSlot,
    clearHairSocket,
    clearAllCosmeticSockets,
    cloneAppearanceMaterials,
    loadCosmeticTemplate,
    loadHairTemplate,
    loadSkinTexture,
    restoreHiddenNodes,
    type CosmeticSlotName,
    type CosmeticLoadoutItem,
    type PlayerLoadout,
} from "./utils/playerCosmetics";

const logger = new Logger("PlayerCosmeticsClient");
const HIDES_HAIR_FLAG = "HIDES_HAIR";

type ConnectionLike = {
    room?: {
        sessionId: string;
        send(type: string, data: unknown): void;
    };
};

type SessionCosmeticsState = {
    loadoutRaw: string;
    loadout: PlayerLoadout;
    hairModelUrl: string;
    hairTextureUrl: string;
    skinTextureUrl: string;
    entrySignature: string;
    token: number;
    applyingToken: number | null;
    appliedToken: number;
    materialsCloned: boolean;
    hiddenByUuid: Map<string, boolean>;
};

function parseLoadout(loadoutRaw: string): PlayerLoadout {
    if (!loadoutRaw) return {};

    try {
        return JSON.parse(loadoutRaw) as PlayerLoadout;
    } catch (error) {
        logger.warn(`Failed to parse loadout JSON: ${String(error)}`);
        return {};
    }
}

function buildEntrySignature(entry: {
    loadoutJson: string;
    hairModelUrl: string;
    hairTextureUrl: string;
    skinTextureUrl: string;
}) {
    return [
        entry.loadoutJson.trim(),
        entry.hairModelUrl.trim(),
        entry.hairTextureUrl.trim(),
        entry.skinTextureUrl.trim(),
    ].join("|");
}

export function initPlayerCosmeticsClientGame(runtime: ClientRuntime, state: PlayerCosmeticsState) {
    const playerRenderer = runtime.getInterface<SimplePlayerRendererInterface>("simple-player-renderer");
    if (!playerRenderer) {
        logger.warn("Simple player renderer interface not found");
        return null;
    }

    const connection = runtime.getInterface<ConnectionLike>("connection");
    const room = connection?.room;
    if (!room) {
        logger.warn("No room connection available");
        return null;
    }

    const localSessionId = room.sessionId;
    const sessions = new Map<string, SessionCosmeticsState>();
    const appliedLoadoutRaw = new Map<string, string>();

    const applySessionCosmetics = async (sessionId: string, token: number) => {
        const sessionState = sessions.get(sessionId);
        if (!sessionState || sessionState.token !== token) return;

        const playerObject = playerRenderer.getRemotePlayerObject(sessionId);
        if (!playerObject) return;

        restoreHiddenNodes(playerObject, sessionState.hiddenByUuid);
        clearAllCosmeticSockets(playerObject);
        clearHairSocket(playerObject);
        const loadoutItems = Object.values(
            sessionState.loadout as Record<string, CosmeticLoadoutItem | null>,
        );
        const shouldHideHair = loadoutItems.some((item) => item?.flags?.includes(HIDES_HAIR_FLAG));
        if (shouldHideHair) {
            applyCosmeticFlags(playerObject, "head", [HIDES_HAIR_FLAG], sessionState.hiddenByUuid);
        } else if (sessionState.hairModelUrl && sessionState.hairTextureUrl) {
            const hairTemplate = await loadHairTemplate(sessionState.hairModelUrl, sessionState.hairTextureUrl);
            if (hairTemplate) {
                const currentSessionState = sessions.get(sessionId);
                if (!currentSessionState || currentSessionState.token !== token) return;

                const currentPlayerObject = playerRenderer.getRemotePlayerObject(sessionId);
                if (!currentPlayerObject) return;
                attachHairToPlayer(currentPlayerObject, hairTemplate);
            }
        }

        if (sessionState.skinTextureUrl) {
            const skinTexture = await loadSkinTexture(sessionState.skinTextureUrl);
            if (skinTexture) {
                const currentSessionState = sessions.get(sessionId);
                if (!currentSessionState || currentSessionState.token !== token) return;

                const currentPlayerObject = playerRenderer.getRemotePlayerObject(sessionId);
                if (!currentPlayerObject) return;
                if (!currentSessionState.materialsCloned) {
                    cloneAppearanceMaterials(currentPlayerObject);
                    currentSessionState.materialsCloned = true;
                }
                applySkinTextureToPlayer(currentPlayerObject, skinTexture);
            }
        }

        for (const slot of COSMETIC_SLOT_NAMES) {
            const slotData = sessionState.loadout[slot as CosmeticSlotName];
            const modelUrl = slotData?.modelUrl?.trim();
            if (!modelUrl) continue;

            const template = await loadCosmeticTemplate(modelUrl, slotData?.textureUrl?.trim() ?? "");
            if (!template) continue;

            const currentSessionState = sessions.get(sessionId);
            if (!currentSessionState || currentSessionState.token !== token) return;

            const currentPlayerObject = playerRenderer.getRemotePlayerObject(sessionId);
            if (!currentPlayerObject) return;

            const attached = attachCosmeticToSlot(currentPlayerObject, slot, template);
            if (!attached) continue;

            applyCosmeticFlags(currentPlayerObject, slot, slotData?.flags, currentSessionState.hiddenByUuid);
        }

        const latestSessionState = sessions.get(sessionId);
        if (!latestSessionState || latestSessionState.token !== token) return;

        latestSessionState.appliedToken = token;
        appliedLoadoutRaw.set(sessionId, latestSessionState.loadoutRaw);
        logger.info(`Applied cosmetics for ${sessionId}`);
    };

    runtime.addSystem("POST_UPDATE", () => {
        for (const [sessionId, entry] of state.players.entries()) {
            if (sessionId === localSessionId) continue;

            const loadoutRaw = entry.loadoutJson?.trim() ?? "";
            let sessionState = sessions.get(sessionId);

            if (!sessionState) {
                const entrySignature = buildEntrySignature(entry);
                sessionState = {
                    loadoutRaw,
                    loadout: parseLoadout(loadoutRaw),
                    hairModelUrl: entry.hairModelUrl.trim(),
                    hairTextureUrl: entry.hairTextureUrl.trim(),
                    skinTextureUrl: entry.skinTextureUrl.trim(),
                    entrySignature,
                    token: 1,
                    applyingToken: null,
                    appliedToken: 0,
                    materialsCloned: false,
                    hiddenByUuid: new Map<string, boolean>(),
                };
                sessions.set(sessionId, sessionState);
            } else if (sessionState.entrySignature !== buildEntrySignature(entry)) {
                sessionState.loadoutRaw = loadoutRaw;
                sessionState.loadout = parseLoadout(loadoutRaw);
                sessionState.hairModelUrl = entry.hairModelUrl.trim();
                sessionState.hairTextureUrl = entry.hairTextureUrl.trim();
                sessionState.skinTextureUrl = entry.skinTextureUrl.trim();
                sessionState.entrySignature = buildEntrySignature(entry);
                sessionState.token += 1;
                sessionState.applyingToken = null;
            }

            if (sessionState.appliedToken === sessionState.token) continue;
            if (sessionState.applyingToken === sessionState.token) continue;

            sessionState.applyingToken = sessionState.token;
            const applyToken = sessionState.token;

            void applySessionCosmetics(sessionId, applyToken)
                .catch((error) => {
                    logger.warn(`Failed applying cosmetics for ${sessionId}: ${String(error)}`);
                })
                .finally(() => {
                    const latest = sessions.get(sessionId);
                    if (!latest || latest.applyingToken !== applyToken) return;
                    latest.applyingToken = null;
                });
        }

        for (const [sessionId, sessionState] of sessions.entries()) {
            if (state.players.has(sessionId)) continue;

            const playerObject = playerRenderer.getRemotePlayerObject(sessionId);
            if (playerObject) {
                restoreHiddenNodes(playerObject, sessionState.hiddenByUuid);
                clearAllCosmeticSockets(playerObject);
                clearHairSocket(playerObject);
            }

            sessions.delete(sessionId);
            appliedLoadoutRaw.delete(sessionId);
        }
    });

    logger.info("Player cosmetics client game initialized");

    return {
        getAppliedLoadoutRaw: (sessionId: string) => appliedLoadoutRaw.get(sessionId) ?? null,
    };
}
