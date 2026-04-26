# Augury Packs & Tarot Cards

Architectural overview of the Tarot subsystem — a shop-purchased "Augury Pack" that lets the player apply one of 5 random Tarots to up to 3 runes from a sampled slice of their pouch, mutating the deck composition for the rest of the run.

## Game Flow

1. Player buys an **Augury Pack** in the shop (`AUGURY_PACK_COST = 4` gold).
2. Server rolls 5 distinct tarot IDs + 8 runes sampled without replacement from the player's live pouch (matches `HAND_SIZE` so the row reads visually like a hand). Both rolls are deterministic from `(runSeed, round, auguryPurchaseCount)`.
3. Pending state is pushed onto `player.pendingAuguryRunes` + `player.pendingAuguryTarots`. Client mounts `AuguryPicker.tsx` over the shop.
4. Player selects up to 3 runes (universal cap = highest `maxTargets` across all tarots), picks one tarot, optionally picks an element (for `requiresElement` tarots), and clicks Apply.
5. Per-slot apply animation plays (flip / fade / pulse depending on the effect). Then the exit timeline flies non-banished runes + spawned runes to the pouch counter while bottom UI slides down.
6. On animation complete the client sends `ARKYN_APPLY_TAROT`. Server validates, mutates `acquiredRunes` / `banishedRunes` / `gold`, clears the pending arrays. Picker unmounts.

The other 4 unpicked tarots are discarded — there is no "save for later" or persistent tarot inventory.

## Tarot Definitions (`shared/tarots.ts`)

22 tarots, one per Major Arcana number (0-XXI). Defined in `TAROT_DEFINITIONS: Record<string, TarotDefinition>`.

```ts
interface TarotDefinition {
    id: string;                    // snake_case registry key + wire id
    name: string;                  // "The Fool", "Wheel of Fortune", …
    number: string;                // "0", "I", "II", … "XXI" (header ornament)
    description: string;           // player-facing one-liner
    effect: TarotEffect;           // discriminated union — see below
    minTargets: number;            // min runes that must be picked
    maxTargets: number;            // max runes that may be picked
    requiresElement?: boolean;     // true → element picker row appears
    targetConstraint?: "commonOrUncommonOnly";  // currently only Strength
    fileBasename: string;          // PNG stem; case is inconsistent across files (see Asset Notes)
}
```

### Effect Union (`TarotEffect`)

| Effect kind | Used by | Banishes? | Adds? | Notes |
|---|---|---|---|---|
| `convertElement` | Fool / Priestess / Emperor / Chariot / Justice / Hanged Man / Death / Temperance / Devil / Star / Moon / Sun | ✓ | ✓ | 1:1 banish→add at same rarity |
| `duplicate` | Magician | ✗ | ✓ | Originals stay; copies pushed to `acquiredRunes` |
| `upgradeRarity` | Empress (1 tier), Strength (2 tiers) | ✓ | ✓ | Strength adds `targetConstraint: "commonOrUncommonOnly"` and `maxTargets: 1` |
| `consecrate` | Hierophant | ✓ | ✓ | Convert to chosen element + rarity+1 |
| `fuse` | Lovers | ✓ | ✓ | 2 → 1 of chosen element with `max(rarity)+1` |
| `wheelReroll` | Wheel of Fortune | ✓ | ✓ | Per-rune RNG: 50% upgrade rarity, 50% randomize element |
| `banish` | Hermit | ✓ | ✗ | No gold, no replacement |
| `banishForGold` | Tower (`goldPerRune: 3`) | ✓ | ✗ | Gold = picked count × goldPerRune |
| `upgradeAllOfElement` | Judgement | ✓ | ✓ | `minTargets: 0, maxTargets: 0` — walks the LIVE pouch by element, not the picker snapshot |
| `addRandomRune` | World (`legendaryChance: 0.20`) | ✗ | ✓ | `minTargets: 0, maxTargets: 0` — uniform random element, 80% Rare / 20% Legendary |

The `targetConstraint: "commonOrUncommonOnly"` field is the only Apply-time rule that gates rune *selection* beyond min/max count. Adding a new constraint kind is a single switch arm in `handleApplyTarot.ts`.

## Augury Pack Roll (`server/utils/rollAuguryPack.ts`)

```ts
rollAuguryPack(runSeed, round, auguryPurchaseCount, livePouch)
  → { runes: RuneInstanceData[], tarotIds: string[] }
```

- **Seed**: `createRoundRng(runSeed, round + AUGURY_PACK_RNG_OFFSET + auguryPurchaseCount * 7919)` — the 7919 prime spreads consecutive packs in the same shop. The same `(runSeed, round, packIndex)` triple always produces the same picker, so reconnecting / replaying mid-pack reproduces the offer exactly.
- **Runes**: sampled from the live pouch *without replacement*, count = `min(AUGURY_PACK_RUNE_CHOICES, pouch.length)`. Each sampled rune gets a fresh `id` (distinct from the live pouch entry — schema id uniqueness).
- **Tarots**: sampled from `TAROT_IDS` *without replacement*, count = `AUGURY_PACK_TAROT_CHOICES = 5`.

### RNG Namespace

`AUGURY_PACK_RNG_OFFSET = 700000`. Slots in the existing namespace map (top of `tarots.ts`):

```
0       enemy selection
50000   boss debuff
100000  shop scrolls
200000  shop sigils
300000  voltage proc        (sigil proc band [300000, 400000))
400000  Rune Pack rolls      (lifecycle band — see CLAUDE.md latent collision note)
500000  pack-slot generation
600000  Codex
700000  Augury Pack ← this system
```

Apply-time RNG (Wheel of Fortune, World) uses a **`+1` bump** off the same base — `round + AUGURY_PACK_RNG_OFFSET + packIndex * 7919 + 1` — so the picker-roll RNG and the apply-time RNG don't collide.

## Server Apply (`server/systems/handleApplyTarot.ts`)

Entry: `ARKYN_APPLY_TAROT { tarotId: string | null, runeIndices: number[], element?: string }`. `tarotId: null` is a Skip (just clears `pendingAuguryRunes` + `pendingAuguryTarots`).

Validation order:
1. Phase = `"shop"` and pack is open (both pending arrays non-empty).
2. `tarotId` is in the offered set (exact match against `pendingAuguryTarots`).
3. `runeIndices`: in bounds, unique, count ∈ `[minTargets, min(maxTargets, runes.length)]`.
4. `element` present iff `tarot.requiresElement`.
5. `targetConstraint` satisfied (Strength: every picked rune is `common` or `uncommon`).

Apply order is **banish-first, add-second**. Doing them in reverse would re-splice the freshly-added runes when banishing by index. Specifically:
1. Build a `TarotEffectContext` from the picked runes + chosen element + live pouch + apply-time RNG (seeded via `getAuguryApplySeed`) + `nextRuneId`.
2. `applyTarotMutation(effect, ctx)` runs the registry's `mutate` for that effect type (see `shared/tarotEffects.ts`) and returns `{ banish, add, goldDelta }`.
3. Push every `banish` entry to `player.banishedRunes`; splice from the live pouch via `removeFirstMatching`.
4. Push every `add` entry to `player.acquiredRunes` AND the live pouch with a fresh id.
5. Apply `goldDelta` (only `banishForGold`).
6. Sync `player.pouchSize`; clear `pendingAuguryRunes` + `pendingAuguryTarots`.

`upgradeAllOfElement` (Judgement) intentionally walks the **live pouch** — the picker snapshot would miss runes added by an earlier tarot in the same shop visit, or runes already in the pouch outside the 8-rune sample.

## Tarot Effect Registry (`shared/tarotEffects.ts`)

Each `TarotEffect` arm is paired with a `mutate` (server commit) and `preview` (client picker preview) function in `TAROT_EFFECT_HANDLERS`. The two share inputs (a `TarotEffectContext` carrying picked runes, chosen element, live pouch, RNG, id factory) and produce parallel outputs (`TarotMutationSet` for the server, `TarotPreviewSet` for the client). Two thin dispatchers — `applyTarotMutation` and `previewTarotEffect` — do the registry lookup and forward.

CRITICAL invariant: for any effect that consumes RNG (Wheel of Fortune, The World), `mutate` and `preview` MUST consume `ctx.rng` in the same order with the same number of calls. Both functions live in the same file and share their per-rune helpers (`rollWheel`, `rollWorld`) so the RNG sequence is written once and reviewed together.

The mapped type `{ [K in TarotEffect["type"]]: TarotEffectHandler<...> }` makes a missing handler a TypeScript error at compile time — adding an effect to the union without adding a registry entry won't compile.

## Banishing (`shared/ArkynState.ts`, `client/ui/PouchModal.tsx`)

`player.banishedRunes: ArraySchema<RuneInstance>` — permanent removals, persists across rounds within a run, resets on new run. Mirrors `player.acquiredRunes` (permanent additions).

The Pouch Modal's per-element row computes:

```
totalForElement = RUNES_PER_ELEMENT
                + bonusByElement.get(element)     // from acquiredRunes
                - banishedByElement.get(element)  // from banishedRunes
```

Without the subtraction, tarot-converted runes leave phantom "spent" slots in their original element row (commit 39cd6b6 was the fix). `useAcquiredRuneStats` (`client/ui/hooks/useAcquiredRuneStats.ts`) computes both per-element maps + the run's effective deck size: `POUCH_SIZE + acquiredRunes.length - banishedRunes.length`.

Tarots are not the only banish source — the Banish sigil (if implemented) would write to the same `banishedRunes` field. The Pouch Modal doesn't care which produced the entry.

## Picker UI (`client/ui/AuguryPicker.tsx`)

Layout (top → bottom): prompt heading → 8 overlapping rune slots → optional element row (13 chips, only when `activeTarot.requiresElement`) → 5 tarot cards → action panel (Apply + Skip).

### Selection Model

State: `selectedTarotIndex | null`, `selectedRuneIndices: Set<number>`, `selectedElement | null`.

Rune picks are decoupled from tarot picks (commit 07ddca7 fix): the player can pre-select up to 3 runes (universal cap = the highest `maxTargets` across all tarots) before choosing a tarot. When a tarot becomes active:
- If pouch-wide (Judgement / World, `maxTargets: 0`) → clear rune selection but keep element state.
- Otherwise → trim selection down to the new `effectiveMax = min(tarot.maxTargets, runes.length)`, keeping the oldest picks (Set iteration order is insertion order).

Apply enabled when: rune count ∈ `[effectiveMin, effectiveMax]` AND element chosen if required AND `targetConstraint` satisfied for every picked rune.

### Apply Animation (per-slot kinds)

Each picked slot gets one of three animation kinds:
- `"flip"` — 3D rotateY 0→180°, back face shows the predicted mutated rune. Used for `convertElement`, `upgradeRarity`, `consecrate`.
- `"fade"` — DissolveCanvas tear (shared shader with the cast pipeline). Used for `banish`, `banishForGold`, `fuse` (both source runes), `wheelReroll`.
- `"pulse"` — scale 1→1.3→1 with the original rune staying visible. Used for `duplicate` (originals don't change; copies materialize in spawn slots to the right of the row — see Spawned-Rune Prediction below).

`applyStartTime` (`performance.now()`) is captured at click and threaded into every DissolveCanvas so all dissolves share a synchronized clock.

### Spawned-Rune Prediction (Lovers / World / Magician)

`computeSpawnedRunes()` mirrors the server's apply-time RNG byte-for-byte to predict the rune the picker should materialize:
- **Lovers**: max(rarity) + 1, chosen element. Deterministic from the picker state — no RNG needed.
- **World**: requires `+1` bump RNG (`AUGURY_PACK_RNG_OFFSET + packIndex * 7919 + 1`); draws element + rarity exactly the way the server will. The preview is reverse-materialized via DissolveCanvas (shader runs backwards: `t: 1 → 0`) so the player sees the new rune *appear* before the exit animation.
- **Magician**: clones each picked rune (same element / rarity / level), one spawn slot per pick. No RNG — the spawns are a 1:1 mirror of the server's `add.push({ ...r })` loop. The originals still pulse in their slots so the player can see what was duplicated; the new copies materialize alongside before the exit fly to the pouch.

If the client's RNG diverges from the server's, the picker shows a different rune than the player ends up with — keep these two RNG paths in lockstep when touching either side.

### Exit Timeline (commit 70aa9fc)

Runs after the apply animation hold:
- Non-faded slots + spawned runes fly to the `PouchCounter` element (0.55s, `power2.in`, 0.04s stagger).
- Bottom UI (tarot row, element row, action panel) slides down 90px (0.3s, `power2.in`, parallel with fly).
- On complete: fires `sendApplyTarot()`. Server clears pending state → schema sync → picker unmounts.

CSS transitions are disabled on slots during the GSAP timeline so the JS-driven transforms aren't fighting CSS.

## Schema Fields (`shared/ArkynState.ts`)

| Field | Type | Lifetime | Purpose |
|---|---|---|---|
| `pendingAuguryRunes` | `ArraySchema<RuneInstance>` | open pack only | 8-rune snapshot the picker renders |
| `pendingAuguryTarots` | `ArraySchema<string>` | open pack only | 5 tarot ids the picker renders |
| `auguryPurchaseCount` | `number` | per shop visit (reset on shop entry) | Picker RNG salt; mutual-exclusivity index |
| `banishedRunes` | `ArraySchema<RuneInstance>` | run lifetime | Permanent removals; subtracted from Pouch Modal totals |
| `acquiredRunes` | `ArraySchema<RuneInstance>` | run lifetime | Permanent additions; sourced by tarot Add and Rune Pack |

`pendingAuguryRunes` and `pendingAuguryTarots` are mutually exclusive with `pendingPackRunes` and `pendingCodexScrolls` — the shop handler dispatcher refuses a purchase if any other pack picker is open.

## Shop Integration (`server/systems/shopItemHandlers.ts`)

Augury Pack is a regular `SHOP_ITEM_HANDLERS` entry (see CLAUDE.md → Shop Item System). The handler:

```ts
auguryPack: ({ player, sessionId }) => {
    if (anyPackPickerOpen(player)) return { ok: false, reason: "a pack picker is already open" };
    const livePouch = getPouch(sessionId) ?? [];
    const { runes, tarotIds } = rollAuguryPack(
        player.runSeed,
        player.currentRound + 1,            // shop seeds with next round (matches Rune Pack / Codex convention)
        player.auguryPurchaseCount,
        livePouch,
    );
    runes.forEach(r => player.pendingAuguryRunes.push(createRuneInstance(r)));
    tarotIds.forEach(t => player.pendingAuguryTarots.push(t));
    player.auguryPurchaseCount++;
    return { ok: true, logMessage: "..." };
}
```

The mutual-exclusivity gate (`anyPackPickerOpen`) is the same one Rune Pack and Codex Pack use — only one picker can be open at a time. Counters reset to 0 on shop entry.

## Constants (`shared/arkynConstants.ts`)

| Constant | Value | Notes |
|---|---|---|
| `AUGURY_PACK_COST` | 5 | Gold cost |
| `AUGURY_PACK_RUNE_CHOICES` | 8 | Matches `HAND_SIZE` |
| `AUGURY_PACK_TAROT_CHOICES` | 5 | Tarots per pack |
| `TAROT_BANISH_GOLD` | 3 | Tower's `goldPerRune` (also lives in the effect object) |
| `WORLD_LEGENDARY_CHANCE` | 0.20 | World — Rare/Legendary split (also in the effect object) |
| `AUGURY_PACK_RNG_OFFSET` | 700000 | RNG namespace (defined in `tarots.ts`) |

## Asset Notes (`assets/tarots/`, `client/ui/tarotAssets.ts`)

Each tarot has `{fileBasename}_1x.png` + `{fileBasename}_2x.png` pulled in via Vite glob. Filenames are **case-inconsistent** across cards (`0_theFool` vs `1_TheMagician` vs `8_justice`) — that's why every `TarotDefinition` carries `fileBasename` rather than computing it from `id`. `15_devil.png` is missing the `_1x` suffix; `getTarotImageUrl` falls back to the bare stem when the suffixed variant is missing.

**The filename stem must exactly match `fileBasename`** — same lookup-by-string pattern as sigil icons; a mismatch shows up as a silently blank card.

## Adding a New Tarot (Checklist)

1. Add metadata to `TAROT_DEFINITIONS` in `shared/tarots.ts` (id, name, number, description, effect, min/maxTargets, optional `requiresElement` / `targetConstraint`, `fileBasename`).
2. Drop PNG art in `assets/tarots/{fileBasename}_1x.png` + `{fileBasename}_2x.png`.
3. If the effect shape doesn't fit the existing `TarotEffect` union, add a new arm in `shared/tarots.ts` AND a paired `{ mutate, preview }` entry in `TAROT_EFFECT_HANDLERS` (`shared/tarotEffects.ts`). The mapped-type lookup makes a missing handler a TS error, so the compiler enforces the pairing. If the effect uses RNG, ensure `mutate` and `preview` consume `ctx.rng` in identical order — both routes seed via `getAuguryApplySeed` so the picker preview matches the server commit.
4. If the effect needs a new per-slot animation kind, add the kind to `SlotPreviewKind` in `shared/tarotEffects.ts` and wire it into `buildAuguryApplyTimeline` (`client/animations/auguryTimelines.ts`).
5. If the effect needs a new `targetConstraint`, add the literal to the union in `shared/tarots.ts` and a check in `handleApplyTarot.ts` validation.

For the 22 currently-implemented tarots, no new code branches are needed beyond the registry entry + asset.
