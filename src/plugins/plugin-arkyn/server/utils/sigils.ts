import {
    expandMimicSigilsDetailed,
    type ArkynPlayerState,
    type ExpandedMimicEntry,
} from "../../shared";

/**
 * Project `player.sigils` (an `ArraySchema<string>`) to a plain `string[]`
 * — what every sigil-effect-registry helper expects. Used wherever a
 * handler reads the player's owned sigils as a flat list.
 *
 * Centralizes the `Array.from(player.sigils)` projection so adding a sigil
 * filter / Mimic awareness / debug-only filter is a single-call-site
 * change.
 */
export function getActiveSigils(player: ArkynPlayerState): string[] {
    return Array.from(player.sigils);
}

/**
 * Same as {@link getActiveSigils} but expanded with Mimic copies — what
 * the lifecycle / cast / discard hook dispatchers iterate. Each Mimic
 * sigil contributes a copy entry for its compatible right neighbor; see
 * `expandMimicSigilsDetailed` for the full rules.
 */
export function getActiveSigilsExpanded(player: ArkynPlayerState): ExpandedMimicEntry[] {
    return expandMimicSigilsDetailed(getActiveSigils(player));
}
