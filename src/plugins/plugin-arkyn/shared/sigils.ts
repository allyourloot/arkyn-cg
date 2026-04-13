import type { RarityType } from "./arkynConstants";

export interface SigilDefinition {
    id: string;
    name: string;
    rarity: RarityType;
    description: string;
    cost: number;
    sellPrice: number;
}

export const SIGIL_DEFINITIONS: Record<string, SigilDefinition> = {
    voltage: {
        id: "voltage",
        name: "Voltage",
        rarity: "uncommon",
        description: "Lightning runes have a {1 in 4} chance to hit twice.",
        cost: 4,
        sellPrice: 2,
    },
};

export const SIGIL_IDS = Object.keys(SIGIL_DEFINITIONS);
