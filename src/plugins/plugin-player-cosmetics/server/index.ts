import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger } from "@core/shared/utils";
import type { AuthPluginInterface } from "@plugins/plugin-auth/server";
import { PlayerCosmeticsEntry, PlayerCosmeticsState } from "../shared";
import { PlayerCosmeticsInterfaceImpl } from "./interfaces/PlayerCosmeticsInterfaceImpl";
import type { PlayerCosmeticsInterface } from "./interfaces/PlayerCosmeticsInterface";

const logger = new Logger("PlayerCosmeticsServer");
const LOCKER_LOADOUT_API_BASE = "http://prod.persuade-creative.hytopia.com/Locker/GetUserLoadout";
const LOCKER_CHARACTER_SETTINGS_API_BASE = "http://prod.persuade-creative.hytopia.com/Locker/GetUserCharacterSettings";
const TEXTURE_GENERATOR_BASE_URL = "https://d3qkovarww0lj1.cloudfront.net/";
const DEFAULT_EYE_COLOR = "FF0000";
const AUTH_SYNC_INTERVAL_MS = 1_000;

type LoadoutItem = {
    flags?: string[] | null;
    modelUrl?: string | null;
    textureUrl?: string | null;
};
type LockerLoadout = Record<string, LoadoutItem | null>;
type LockerCharacterSettingsResponse = {
    clothing?: string;
    skinTone?: string;
    hairModelUrl?: string;
    hairTextureUrl?: string;
};
const LOAD_RETRY_MS = 10_000;

async function fetchUserLoadout(userId: string): Promise<LockerLoadout | null> {
    try {
        const url = `${LOCKER_LOADOUT_API_BASE}/${encodeURIComponent(userId)}`;
        const response = await fetch(url, {
            method: "GET",
            headers: { "User-Agent": "insomnia/2023.5.8" },
        });

        if (!response.ok) {
            logger.warn(`Loadout API returned ${response.status} for user ${userId}`);
            return null;
        }

        return await response.json() as LockerLoadout;
    } catch (error) {
        logger.warn(`Failed to fetch loadout for ${userId}: ${String(error)}`);
        return null;
    }
}

async function fetchUserCharacterSettings(userId: string): Promise<LockerCharacterSettingsResponse | null> {
    try {
        const url = `${LOCKER_CHARACTER_SETTINGS_API_BASE}/${encodeURIComponent(userId)}`;
        const response = await fetch(url, {
            method: "GET",
            headers: { "User-Agent": "insomnia/2023.5.8" },
        });

        if (!response.ok) {
            logger.warn(`Character settings API returned ${response.status} for user ${userId}`);
            return null;
        }

        return await response.json() as LockerCharacterSettingsResponse;
    } catch (error) {
        logger.warn(`Failed to fetch character settings for ${userId}: ${String(error)}`);
        return null;
    }
}

function buildSkinTextureUrl(settings: LockerCharacterSettingsResponse): string | null {
    const skinTone = settings.skinTone?.trim();
    const clothing = settings.clothing?.trim();
    if (!skinTone || !clothing) return null;

    const params = new URLSearchParams({
        skin_tone: skinTone,
        eye_color: DEFAULT_EYE_COLOR,
        clothing,
    });

    return `${TEXTURE_GENERATOR_BASE_URL}?${params.toString()}`;
}

export function PluginPlayerCosmeticsServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-player-cosmetics",
        name: "Player Cosmetics",
        version: "0.0.1",
        description: "Fetches user loadouts and publishes cosmetic attachment data.",
        author: "Matt (@matt)",
        dependencies: ["auth"],
        init: async (runtime: ServerRuntime) => {
            const state = new PlayerCosmeticsState();
            const authInterface = runtime.getInterface<AuthPluginInterface>("auth");
            if (!authInterface) {
                logger.warn("Auth interface not found");
                return state;
            }
            const loadsInFlight = new Set<string>();
            const nextRetryAtBySessionId = new Map<string, number>();

            const loadAndStorePlayerCosmetics = async (sessionId: string): Promise<boolean> => {
                const authUser = authInterface.getUserBySessionId(sessionId);
                if (!authUser?.userId) {
                    nextRetryAtBySessionId.set(sessionId, Date.now() + LOAD_RETRY_MS);
                    return false;
                }

                const [loadout, characterSettings] = await Promise.all([
                    fetchUserLoadout(authUser.userId),
                    fetchUserCharacterSettings(authUser.userId),
                ]);
                if (!loadout) {
                    logger.warn(`No loadout found for user ${authUser.userId}`);
                    nextRetryAtBySessionId.set(sessionId, Date.now() + LOAD_RETRY_MS);
                    return false;
                }

                const entry = new PlayerCosmeticsEntry();
                entry.userId = authUser.userId;
                entry.loadoutJson = JSON.stringify(loadout);
                entry.hairModelUrl = characterSettings?.hairModelUrl?.trim() ?? "";
                entry.hairTextureUrl = characterSettings?.hairTextureUrl?.trim() ?? "";
                entry.skinTextureUrl = characterSettings ? (buildSkinTextureUrl(characterSettings) ?? "") : "";
                state.players.set(sessionId, entry);
                nextRetryAtBySessionId.delete(sessionId);

                logger.info(`Loaded cosmetics for ${authUser.userId} (${sessionId})`);
                return true;
            };

            runtime.addInterface(
                "player-cosmetics",
                new PlayerCosmeticsInterfaceImpl(state, loadAndStorePlayerCosmetics),
            );

            const syncFromAuth = () => {
                const now = Date.now();
                for (const authUser of authInterface.getAllUsers()) {
                    const sessionId = authUser.sessionId;
                    if (state.players.has(sessionId) || loadsInFlight.has(sessionId)) continue;

                    const nextRetryAt = nextRetryAtBySessionId.get(sessionId) ?? 0;
                    if (now < nextRetryAt) continue;

                    loadsInFlight.add(sessionId);
                    void loadAndStorePlayerCosmetics(sessionId)
                        .catch((error) => {
                            logger.warn(`Failed loading cosmetics for session ${sessionId}: ${String(error)}`);
                            nextRetryAtBySessionId.set(sessionId, Date.now() + LOAD_RETRY_MS);
                        })
                        .finally(() => {
                            loadsInFlight.delete(sessionId);
                        });
                }
            };
            syncFromAuth();
            setInterval(syncFromAuth, AUTH_SYNC_INTERVAL_MS);

            runtime.onClientLeave((client: { sessionId: string }) => {
                state.players.delete(client.sessionId);
                loadsInFlight.delete(client.sessionId);
                nextRetryAtBySessionId.delete(client.sessionId);
            });

            logger.info("Player cosmetics server plugin initialized");
            return state;
        },
    });
}

export type { PlayerCosmeticsInterface };
