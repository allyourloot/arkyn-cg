// Spellbooks are the grimoire a player brings into a match — the container
// they draw runes from each round. Future spellbooks will apply match-wide
// modifiers (e.g. +1 hand size, -1 discard) layered on top of the base
// rules, but the Standard book is a baseline with no modifiers, so for now
// this file is mostly metadata the UI uses to render the spellbook icon.

export type SpellbookId = "standard";

export interface SpellbookDefinition {
    id: SpellbookId;
    name: string;
    description: string;
}

export const SPELLBOOKS: Record<SpellbookId, SpellbookDefinition> = {
    standard: {
        id: "standard",
        name: "Standard",
        description: "A baseline spellbook with no modifiers.",
    },
};

export const DEFAULT_SPELLBOOK_ID: SpellbookId = "standard";
