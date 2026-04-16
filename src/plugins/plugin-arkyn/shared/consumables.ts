import { ELEMENT_TYPES } from "./arkynConstants";

/**
 * Consumable system — data-driven parallel to the sigil effect registries.
 *
 * A consumable is a one-shot item the player carries in the Consumable Bar
 * (up to MAX_CONSUMABLES). Today every consumable is a "scroll consumable"
 * (one per element) that grants +1 scroll level when used; the registry is
 * shaped so future kinds (potions, run-wide buffs, etc.) slot in as new
 * `ConsumableEffect` arms with zero dispatcher changes elsewhere.
 *
 * Schema field (`player.consumables`) stores consumable IDs as plain strings
 * — for scroll consumables the id equals the element name (fire, water, …)
 * so the existing persisted shape is unchanged. New consumable kinds should
 * pick IDs that won't collide with element names (e.g. `"potion_haste"`).
 */

/**
 * Discriminated effect applied when a consumable is used. New kinds should
 * be added as new arms — the handler in `handleUseConsumable.ts` switches
 * over `type` and ignores unknown variants (forward compatibility).
 */
export type ConsumableEffect =
    | { type: "upgradeScroll"; element: string };

export interface ConsumableDefinition {
    /** Registry key; equals the value stored in `player.consumables`. */
    id: string;
    /** Display name shown in the Consumable Bar tooltip. */
    name: string;
    /** What happens when the player clicks Use. */
    effect: ConsumableEffect;
}

function capitalize(s: string): string {
    return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Canonical registry. Currently auto-populated with one scroll consumable
 * per element; add hand-written entries below for non-scroll consumables.
 */
export const CONSUMABLE_DEFINITIONS: Record<string, ConsumableDefinition> =
    Object.fromEntries(
        ELEMENT_TYPES.map(element => [
            element,
            {
                id: element,
                name: `${capitalize(element)} Scroll`,
                effect: { type: "upgradeScroll", element },
            } satisfies ConsumableDefinition,
        ]),
    );

export function getConsumableDefinition(id: string): ConsumableDefinition | undefined {
    return CONSUMABLE_DEFINITIONS[id];
}
