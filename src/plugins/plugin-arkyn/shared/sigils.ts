import { COMBINABLE_ELEMENTS, type ElementType, type RarityType } from "./arkynConstants";

export interface SigilDefinition {
    id: string;
    name: string;
    rarity: RarityType;
    description: string;
    cost: number;
    sellPrice: number;
    /**
     * Optional explainer shown in the tooltip below the description — a
     * small row of element rune icons with a label. Used when a sigil's
     * effect only applies to a specific element group (e.g. Fuze only
     * fuses Elemental runes, not Arcane) and the scope isn't obvious
     * from the description alone.
     */
    explainer?: {
        label?: string;
        elements: readonly ElementType[];
    };
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
    fuze: {
        id: "fuze",
        name: "Fuze",
        rarity: "rare",
        description: "Any {2} Elemental runes can fuse into a {Combo spell}.",
        cost: 6,
        sellPrice: 3,
        explainer: {
            label: "Elemental runes:",
            elements: COMBINABLE_ELEMENTS,
        },
    },
    hourglass: {
        id: "hourglass",
        name: "Hourglass",
        rarity: "rare",
        description: "Played runes have a {1 in 4} chance to retrigger once.",
        cost: 6,
        sellPrice: 3,
    },
};

export const SIGIL_IDS = Object.keys(SIGIL_DEFINITIONS);
