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
    burnrite: {
        id: "burnrite",
        name: "Burnrite",
        rarity: "uncommon",
        description: "Unlocks {Fire + Death} spell synergy.",
        cost: 4,
        sellPrice: 2,
    },
    caster: {
        id: "caster",
        name: "Caster",
        rarity: "common",
        description: "{+1 Cast} per round.",
        cost: 3,
        sellPrice: 1,
    },
    synapse: {
        id: "synapse",
        name: "Synapse",
        rarity: "rare",
        description: "Each held Psy rune adds {+2 Mult} to your casts.",
        cost: 6,
        sellPrice: 3,
    },
    fortune: {
        id: "fortune",
        name: "Fortune",
        rarity: "uncommon",
        description: "Critical runes have a {1 in 3} chance to grant {+2 gold}.",
        cost: 4,
        sellPrice: 2,
    },
};

export const SIGIL_IDS = Object.keys(SIGIL_DEFINITIONS);
