import { ARCANE_CLUSTER_ELEMENTS, COMBINABLE_ELEMENTS, type ElementType, type RarityType } from "./arkynConstants";

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
    thief: {
        id: "thief",
        name: "Thief",
        rarity: "common",
        description: "Gain a random {Scroll} at the start of each round.",
        cost: 3,
        sellPrice: 1,
    },
    supercell: {
        id: "supercell",
        name: "Supercell",
        rarity: "rare",
        description: "Lightning and Air spells gain {x3 Mult}.",
        cost: 6,
        sellPrice: 3,
        explainer: {
            label: "Applies to:",
            elements: ["lightning", "air"] as const,
        },
    },
    eruption: {
        id: "eruption",
        name: "Eruption",
        rarity: "uncommon",
        description: "Fire and Earth spells gain {x3 Mult}.",
        cost: 4,
        sellPrice: 2,
        explainer: {
            label: "Applies to:",
            elements: ["fire", "earth"] as const,
        },
    },
    impale: {
        id: "impale",
        name: "Impale",
        rarity: "common",
        description: "{Steel} runes ignore enemy resistance.",
        cost: 3,
        sellPrice: 1,
        explainer: {
            label: "Applies to:",
            elements: ["steel"] as const,
        },
    },
    plunder: {
        id: "plunder",
        name: "Plunder",
        rarity: "common",
        description: "Earn {+5 Gold} at the end of each round.",
        cost: 3,
        sellPrice: 1,
    },
    arcana: {
        id: "arcana",
        name: "Arcana",
        rarity: "uncommon",
        description: "Each played {Arcane Cluster} rune adds {+2 Mult}.",
        cost: 4,
        sellPrice: 2,
        explainer: {
            label: "Arcane Cluster runes:",
            elements: ARCANE_CLUSTER_ELEMENTS,
        },
    },
    lex_divina: {
        id: "lex_divina",
        name: "Lex Divina",
        rarity: "uncommon",
        description: "{Holy} runes gain {+8 Base} and {+2 Mult} on Critical hits.",
        cost: 4,
        sellPrice: 2,
        explainer: {
            label: "Applies to:",
            elements: ["holy"] as const,
        },
    },
    engine: {
        id: "engine",
        name: "Engine",
        rarity: "common",
        description: "{Steel} runes gain {+4 Base} and {+2 Mult}.",
        cost: 3,
        sellPrice: 1,
        explainer: {
            label: "Applies to:",
            elements: ["steel"] as const,
        },
    },
    scroll_god: {
        id: "scroll_god",
        name: "Scroll God",
        rarity: "uncommon",
        description: "Scrolls grant {+2 levels} instead of +1.",
        cost: 4,
        sellPrice: 2,
    },
    executioner: {
        id: "executioner",
        name: "Executioner",
        rarity: "rare",
        description: "Gain {+0.2x Mult} per Critical Hit. {Persists} across rounds.",
        cost: 6,
        sellPrice: 3,
    },
    binoculars: {
        id: "binoculars",
        name: "Binoculars",
        rarity: "common",
        description: "Disable {one random enemy resistance} each round.",
        cost: 3,
        sellPrice: 1,
    },
    haphazard: {
        id: "haphazard",
        name: "Haphazard",
        rarity: "rare",
        description: "Play {all unique} runes to cast {Abomination}. {Tier} equals runes played. {-1 Hand Size}.",
        cost: 6,
        sellPrice: 3,
    },
};

export const SIGIL_IDS = Object.keys(SIGIL_DEFINITIONS);
