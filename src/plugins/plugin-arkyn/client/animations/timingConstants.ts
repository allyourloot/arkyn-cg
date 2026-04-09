// ============================================================
// Animation timing constants
// ------------------------------------------------------------
// Lives in its own module so both `arkynAnimations.ts` (the orchestrator)
// and `castTimeline.ts` (the GSAP timeline factory) can import these
// without forming a circular module dependency. Since `castTimeline.ts`
// reads several of these at module-eval time (computing seconds-based
// mirrors), the cycle would otherwise yield `undefined` for those values
// and crash the app at load.
//
// Public consumers (e.g. `ArkynOverlay.tsx`) keep importing from the
// `arkynStore` barrel, which re-exports these via `arkynAnimations.ts`.
// ============================================================

export const DISSOLVE_DURATION_MS = 550;
export const DISSOLVE_STAGGER_MS = 150;

// Beat between the runes landing in the play area and the "valid" runes
// lifting up. Long enough for the player to register every played rune
// sitting in its slot before the spell-resolution choreography starts.
export const SETTLE_DELAY_MS = 1000;

// Duration of the slot raise transition. We delay the damage bubbles by
// this amount so the runes finish lifting BEFORE their numbers start
// popping. Mirrored in the GSAP slot-raise tween in PlayArea.tsx.
export const RAISE_DURATION_MS = 220;

// Duration of a single floating damage bubble's full animation (appear +
// drift + fade). MUST match the GSAP timeline duration in
// RuneDamageBubble.tsx.
export const BUBBLE_DURATION_MS = 600;

// Stagger between consecutive damage bubbles in a multi-rune cast. Each
// successive contributing rune's bubble appears this many ms after the
// previous one so the "count" reads sequentially.
export const BUBBLE_STAGGER_MS = 180;

// Quiet beat after the LAST bubble finishes before the dissolve begins —
// gives the final number a moment to land before the runes tear apart.
export const BUBBLE_TAIL_BUFFER_MS = 150;

// Duration of the enemy health-bar floating damage / shake animation.
export const ENEMY_DAMAGE_HIT_MS = 900;
