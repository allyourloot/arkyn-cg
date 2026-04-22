import { SIGIL_DEFINITIONS, SIGIL_IDS } from "../shared";
import { sendDebugGrantSigil } from "./arkynNetwork";

/**
 * Dev-only browser console helpers. Side-effect import from
 * `client/index.tsx` so these commands are available as soon as the
 * Arkyn client plugin boots.
 *
 * Usage in the browser devtools console:
 *   arkyn.grantSigil("magic_mirror")     // adds Magic Mirror to your bar
 *   arkyn.listSigils()                   // prints all sigil ids + names
 *
 * The server validates every call (unknown id, duplicate, full bar, etc.
 * are all rejected with a warn log) so typos are safe — they just
 * no-op with a server-side log line.
 */

function grantSigil(sigilId: string): void {
    if (!SIGIL_DEFINITIONS[sigilId]) {
        // Client-side courtesy check so the devtools user gets immediate
        // feedback about a typo. Fuzzy match keeps "magicmirror" or
        // "magic-mirror" discoverable.
        const suggestions = SIGIL_IDS.filter(id =>
            id.toLowerCase().includes(sigilId.toLowerCase().replace(/[-_\s]/g, "")),
        );
        const hint = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
        console.warn(`[arkyn.grantSigil] Unknown sigil id "${sigilId}".${hint}`);
        return;
    }
    sendDebugGrantSigil(sigilId);
    console.info(`[arkyn.grantSigil] Requested "${sigilId}" (${SIGIL_DEFINITIONS[sigilId].name}).`);
}

function listSigils(): void {
    console.table(
        SIGIL_IDS.map(id => ({
            id,
            name: SIGIL_DEFINITIONS[id].name,
            rarity: SIGIL_DEFINITIONS[id].rarity,
            cost: SIGIL_DEFINITIONS[id].cost,
        })),
    );
}

// Attach to the global window so devtools can call without any import.
// `as unknown as …` avoids extending the Window type project-wide for
// what's strictly a dev helper.
(window as unknown as { arkyn: Record<string, unknown> }).arkyn = {
    grantSigil,
    listSigils,
};

// Print a one-time banner so devs know the helpers exist without having
// to remember them. Keeps the discovery path obvious during playtest.
console.info(
    "[arkyn] Debug helpers ready: arkyn.grantSigil(id), arkyn.listSigils()",
);
