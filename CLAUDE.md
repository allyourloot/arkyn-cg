# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Install dependencies:**
```bash
pnpm install
```

**Build all packages (core + plugins):**
```bash
pnpm build
```

**Run the template sandbox (development):**
```bash
# Terminal 1 - client
cd packages/template-sandbox && pnpm client

# Terminal 2 - server
cd packages/template-sandbox && pnpm server
```
Client runs on port 8180, server on port 8181.

**Build a single plugin:**
```bash
cd packages/plugin-<name> && pnpm build
```

**Package the sandbox for deployment:**
```bash
cd packages/template-sandbox && pnpm package
```

## Architecture Overview

This is a monorepo (`pnpm` workspaces) for **HYTOPIA Neo** — a voxel-based multiplayer game framework built around a plugin-first architecture. Everything beyond core networking is a swappable plugin.

### Core Package (`packages/core`)

Provides the runtime infrastructure:

- **Server side**: `ServerBuilder` (entry point) → `ColyseusServer` → `GameRoom` (one per game session) → `ServerRuntime` (manages system loop and plugin state)
- **Client side**: `ClientBuilder` → `Connection` (Colyseus WebSocket) → `ClientRuntime` (manages systems and React overlays)
- **Shared**: `GameState` (Colyseus Schema — contains a map of plugin states), `PluginState` (base Schema class all plugins extend)

Network sync is automatic via Colyseus Schema. Imperative actions use message passing.

### Plugin System

Every feature is a plugin. Each plugin package exports three separate entry points:
- `<pkg>/server` — `ServerPlugin` definition (runs in Node.js, returns a Schema-based state)
- `<pkg>/client` — `ClientPlugin` definition (runs in browser, adds systems/UI)
- `<pkg>/shared` — shared types and Schema state classes

**ServerPlugin** must implement `init(runtime: ServerRuntime): Promise<PluginState>`. The returned state is automatically synced to all clients.

**ClientPlugin** must implement `init(runtime: ClientRuntime, state: PluginState): Promise<void>`.

### Runtime System Loop

Both server and client runtimes execute registered **systems** (plain functions) each tick in ordered phases:

- Server: `PRE_UPDATE → UPDATE → POST_UPDATE`
- Client: `PRE_FIXED_UPDATE → FIXED_UPDATE → POST_FIXED_UPDATE → PRE_UPDATE → UPDATE → POST_UPDATE`

Systems are registered with `runtime.addSystem(phase, fn)`.

### Plugin Communication

Plugins **must not** import each other's state types directly. Use:
1. **Interfaces** — `runtime.addInterface('name', impl)` / `runtime.getInterface('name')` for synchronous API between plugins
2. **Messages** — `runtime.sendMessage` / `runtime.onMessage` for event-driven communication

### Asset Convention

Generated or copied assets go in `assets/__generated/<plugin-name>/` within the consuming package.

### Template Sandbox (`packages/template-sandbox`)

Reference game implementation. Client is built with Vite + React + Tailwind CSS. Server runs with `tsx`. Demonstrates how to compose plugins into a working game.

---

## Arkyn Plugin (`src/plugins/plugin-arkyn`)

The main gameplay plugin — a Balatro-inspired roguelike card battler where players draw runes from a pouch, build poker-style hands, and cast spells against enemies.

### Game Flow

1. Player joins → `handleJoin` creates a fresh 52-rune pouch (13 elements × 4 each), draws a hand of 8, spawns the first enemy.
2. Each round: player selects runes from hand, casts spells or discards. 3 casts and 3 discards per round.
3. Cast resolves a spell via `resolveSpell`, computes damage via `calculateSpellDamage` (Base + Mult model), applies to enemy HP.
4. Enemy defeated → round-end overlay shows gold rewards → player clicks Continue → next round with a new enemy and fresh pouch.

### Spell Resolution (`shared/resolveSpell.ts`)

The resolver uses a **poker-hand model** — only specific rune shapes produce combo spells:

- **Single-element stacking**: 1-5 runes of the same element → Tier 1-5 spell. Always works.
- **Two Pair** `[2,2]`: Two pairs of synergy-kin elements → unique Tier 4 combo spell. Looked up in `TWO_PAIR_TABLE`. Also supports `[2,2,1]` with a kicker rune (kicker is consumed but doesn't contribute damage).
- **Full House** `[3,2]`: Three of one kin element + two of another → unique Tier 5 combo spell. Looked up in `FULL_HOUSE_TABLE`. Directional (3F+2L ≠ 3L+2F).
- **Everything else** (mixed junk, 3+ elements, non-kin pairs): falls to single-element fallback. Non-matching runes are wasted.

Synergy pairs are defined in `SYNERGY_PAIRS` (`shared/spellTable.ts`) — 22 unordered element pairs. Only these produce poker-shape combos.

**Loose duo combos** (`COMBO_TABLE`) are **gated behind the Fuze sigil**. The base game resolver skips the loose-duo branch; owning Fuze (registered in `SIGIL_LOOSE_DUO_UNLOCKS`) flips `looseDuosEnabled(sigils)` to true and any 2-distinct-combinable-element cast fires the matching `COMBO_TABLE` entry (Steam Burst, Hailstorm, Plasma Cannon, etc.) with tier = total runes played (capped at 5). Without Fuze, mixed casts fall through to the single-element fallback.

### Damage Model — Base + Mult (`shared/calculateDamage.ts`)

Balatro-style chip × mult system:

```
baseTotal   = SPELL_TIER_BASE_DAMAGE[tier] + Σ ((RUNE_BASE_DAMAGE[rarity] + scrollBonus) × resistMod)
finalMult   = (SPELL_TIER_MULT[tier] + bonusMult) × xMult
finalDamage = baseTotal × finalMult
```

- `SPELL_TIER_BASE_DAMAGE = [0, 4, 8, 12, 16, 20]` — flat per-tier base.
- `SPELL_TIER_MULT = [0, 1, 2, 3, 4, 5]` — flat per-tier multiplier.
- `RUNE_BASE_DAMAGE = { common: 8, uncommon: 12, rare: 18, legendary: 30 }` — per-rune contribution by rarity. Higher-rarity runes drop from Rune Bags (see Rune Bag System below).
- Per-rune `resistMod`: ×2.0 if enemy is weak to that rune's element, ×0.5 if resistant, ×1.0 neutral. Resistance-ignore sigils (Impale) filter matching elements out of the resistances list at the call site, so those runes fall through to neutral.
- `scrollBonus` = `SCROLL_RUNE_BONUS (2) × scrollLevels[element]`, applied per-rune BEFORE the resist/weak multiplier so it compounds with both.
- `calculateSpellDamage(spell, runes, rarities, resistances, weaknesses, scrollLevels?, bonusMult?, xMult?)` returns the full `SpellDamageBreakdown` (spellBase, runeBaseContributions, baseTotal, mult, finalDamage, per-rune crit/resist flags). `bonusMult` is the sum of all additive-mult sigil bonuses (Synapse hand-mult + Arcana played-mult); `xMult` multiplies the total mult (Supercell/Eruption spell-element xMult).
- Server calls `calculateDamage(...)` (returns `{ finalDamage, procGold }`) from `handleCast.ts`. Proc gold (Fortune-style grants) is credited in the same patch as the damage.
- **Single source of truth for sigil-driven modifiers** — `shared/composeCastModifiers.ts` wraps the five sigil registry lookups (hand-mult, played-mult, xMult, resist-ignore, and the derived totals) into one pure function. Both `server/utils/calculateDamage.ts` AND `client/arkynAnimations.ts` call it with identical inputs, returning `{ bonusMult, xMult, effectiveResistances, breakdowns: { handMult[], playedMult[], xMult[] } }`. Server uses the totals; client uses the breakdowns to build per-sigil bubbles / mult ticks / xMult reveals. Server/client damage drift is structurally impossible — adding a new additive-mult category means updating this one file.

### Cast Animation Pipeline (client)

1. `castSpell()` in `arkynAnimations.ts` captures DOM positions for flight tweens, then delegates the damage/bubble/event calculation to `assembleCastBreakdown()` in the same file.
2. `assembleCastBreakdown()` is the pure-ish helper that: resolves the spell, calls `composeCastModifiers()` (see Damage Model), runs `calculateSpellDamage` with identical inputs to the server, iterates sigil procs via `iterateProcs`, and emits `{ runeBreakdown, bubbles, procBubblesForCast, handMultBubblesForCast, totalDamage, spellBaseDamage, baseTotal, hasCritical, hasAnyProc, hasAnyMultEvent, ... }`. `castSpell` stays ~200 lines of orchestration (flight capture → breakdown call → timeline callback wiring).
3. `runeBreakdown[]` is the flat event list the timeline consumes — typed as `CastBreakdownEvent[]` with discriminator flags (`isProc` / `isMultTick` / `isXMult` / `isGold`, plus `sigilId` for generic dispatch). See "Cast timeline + event flags" under the Sigil System.
4. The GSAP timeline (`buildCastTimeline`) orchestrates: fly runes to play area → settle → raise contributing slots → per-rune damage bubbles pop (staggered) while the Base counter ticks in the Spell Preview → dissolve shader tears runes apart → total damage count-up reveal (0.5s GSAP tween) → enemy floating damage number + HP bar shake → cleanup.
5. Key store fields: `castBaseCounter` (live Base tick), `castTotalDamage` (live Total count-up, sentinel `-1` until reveal), `lastCastBaseDamage` (snapshot for Last Cast view), `castMultCounter` (ticks per additive-mult event, then multiplies on xMult).

### Sigil System (`shared/sigilEffects.ts`, `shared/sigils.ts`)

Sigils are shop-purchased items that modify a run. **14 sigils are implemented today** across **10 effect categories**, and the system is designed to scale to 50+ via **data-driven effect registries** — adding most new sigils is a single data entry, zero code branches.

**Two files, clear separation of concerns:**
- `shared/sigils.ts` — `SIGIL_DEFINITIONS: Record<string, SigilDefinition>` with metadata (id, name, rarity, description with `{highlighted}` markers, cost, sellPrice, optional `explainer` showing trigger-element icons in the tooltip).
- `shared/sigilEffects.ts` — category-based registries for mechanics, plus pure helpers consumers call generically.

**Ten effect categories.** A sigil can appear in multiple (e.g. a future "+1 cast AND 10% fire proc" sigil would have entries in both `SIGIL_STAT_MODIFIERS` and `SIGIL_PROCS`).

| # | Category | Registry | Helper | Sigils |
|---|---|---|---|---|
| 1 | Stat modifiers | `SIGIL_STAT_MODIFIERS` | `getPlayerStatDeltas(sigils)` | Caster: `{ castsPerRound: 1 }` |
| 2 | RNG procs on played runes | `SIGIL_PROCS` | `iterateProcs(sigils, elements, seed, round, cast, isCritical?)` | Voltage (25% on lightning → double_damage), Fortune (33% on critical → +2 gold), Hourglass (25% any element → double_damage) |
| 3 | Hand-based mult | `SIGIL_HAND_MULT` | `getHandMultBonus(sigils, hand, excluded)` | Synapse: `{ element: "psy", multPerRune: 2 }` |
| 4 | Lifecycle hooks | `SIGIL_LIFECYCLE_HOOKS` | `hooks.onRoundStart(round, seed, ctx)` → `RoundStartEffect[]` | Thief (onRoundStart → `[{ type: "grantConsumable", consumableId }]`), Binoculars (onRoundStart → `[{ type: "disableResistance", element }]` — random pick from `ctx.enemyResistances`) |
| 5 | Resolver synergy/feature unlocks | `SIGIL_SYNERGY_PAIRS` (in `spellTable.ts`), `SIGIL_LOOSE_DUO_UNLOCKS` | `isSynergyPair(a, b, sigils)`, `looseDuosEnabled(sigils)` | Burnrite (unlocks `"death+fire"` synergy), Fuze (unlocks loose-duo combos for any 2 combinable elements) |
| 6 | Spell-element xMult | `SIGIL_SPELL_X_MULT` | `getSpellXMult(sigils, spellElements)` | Supercell (lightning/air spells × 3), Eruption (fire/earth spells × 3) |
| 7 | Resistance ignore | `SIGIL_RESIST_IGNORE` | `getIgnoredResistanceElements(sigils, dynamicIgnored?)` | Impale (`["steel"]` — static nullification). Binoculars contributes a **dynamic** per-round pick via the lifecycle hook; the helper's optional `dynamicIgnored` param merges `player.disabledResistance` with the static registry so both feed `effectiveResistances` on one code path. |
| 8 | End-of-round gold | `SIGIL_END_OF_ROUND_GOLD` | `getEndOfRoundSigilGold(sigils)` | Plunder (`{ amount: 5 }`) |
| 9 | Played-rune mult | `SIGIL_PLAYED_MULT` | `getPlayedMultBonus(sigils, contributingRunes)` | Arcana (`{ elements: ARCANE_CLUSTER_ELEMENTS, multPerRune: 2 }`) |
| 10 | Critical-rune bonus | `SIGIL_CRITICAL_RUNE_BONUS` | `getCriticalRuneBonus(sigils, elements, isCritical)` | Lex Divina (`{ element: "holy", baseBonus: 8, multBonus: 2 }` — +8 Base post-modifier and +2 Mult per holy crit) |

**Additive vs multiplicative mult**: Categories 3 (hand-mult), 9 (played-mult), and 10 (crit-rune-bonus mult portion) all feed the additive `bonusMult` channel; their values sum. Category 6 (spell xMult) is multiplicative and applies AFTER the additive sum: `finalMult = (tierMult + bonusMult) × xMult`. Proc damage from Voltage/Hourglass uses the same final mult, so additive + multiplicative sigils stack cleanly with procs.

**Post-modifier per-rune base bonus** (Category 10): The base portion of `SIGIL_CRITICAL_RUNE_BONUS` is distinct from mult — it's a FLAT per-rune base added AFTER the resist/weak ×-modifier has been applied (so "+8 Base" reads as "+8 to the number that lands", not "+8 that then gets doubled by weakness"). `composeCastModifiers` returns this as `perRuneBaseBonus: number[]`, and `calculateSpellDamage` accepts it as an optional parameter that gets added directly to each rune's post-modifier contribution. Because the bonus lands inside `runeBaseContributions[i]`, the per-rune damage bubble, proc double-damage re-pops, and `baseTotal` automatically pick it up.

**Proc RNG determinism**: Each proc entry carries a unique `rngOffset` derived from the slot helpers `procRngSlot(n)` / `lifecycleRngSlot(n)` (not raw magic numbers). Slots are append-only — Voltage = `procRngSlot(0)` = 300000, Fortune = `procRngSlot(1)` = 310000, Hourglass = `procRngSlot(2)` = 320000; Thief = `lifecycleRngSlot(0)` = 400000, Binoculars = `lifecycleRngSlot(1)` = 410000. Procs live in band `[300000, 400000)`, lifecycle hooks in band `[400000, 500000)`, spaced by `SIGIL_RNG_OFFSET_SPACING = 10000`. Server and client both use `createRoundRng(runSeed, rngOffset + round * 10 + castNumber)` so they agree byte-for-byte on which runes proc. Module-load validation throws on duplicate offsets, out-of-band offsets, or offsets that don't align to the spacing grid — don't hand-pick numbers; use the slot helpers.

**⚠ Latent namespace collision**: `rollBagRunes` uses base `400000 + round + bagIndex * 7919`, which shares the lifecycle band. Today it doesn't interact because Thief is slot 0 and only fires one rng() call at `400000 + round` — the bag jitter steps clear. **Any new lifecycle sigil MUST use slot ≥ 1** — Binoculars = `lifecycleRngSlot(1)` already claims slot 1, so the next added lifecycle sigil uses slot 2 (`lifecycleRngSlot(2)` = 420000). The namespace map is documented at the top of `sigilEffects.ts`.

**Where the registries plug in:**
- `server/utils/initPlayerForRound.ts` applies `getPlayerStatDeltas(sigils)` and iterates `SIGIL_LIFECYCLE_HOOKS`. Each hook returns `RoundStartEffect[]` — a discriminated union the caller dispatches over (`grantConsumable` / `grantGold` / `grantStat` / `disableResistance`). Hooks receive a third arg `ctx: RoundStartContext = { enemyResistances, enemyWeaknesses }` derived from the already-spawned next-round enemy (the round_end → shop transition pre-spawns it; shop → playing just reads `state.enemy.*`). `disableResistance` sets `player.disabledResistance` (a `@type("string")` field on `ArkynPlayerState`), which is cleared at the top of every `initPlayerForRound` so stale picks can't leak across matchups. One hook can return multiple effects; new effect kinds add as switch arms without touching the hook definitions.
- `server/utils/calculateDamage.ts` delegates all damage-phase modifier composition to `composeCastModifiers()` (shared helper — see Damage Model). The wrapper then loops `iterateProcs(...)` for proc damage/gold using the shared helper's computed `effectiveResistances`.
- `server/systems/handleCast.ts` calls `getEndOfRoundSigilGold(sigils).total` on the killing blow and stages it into `player.lastRoundGoldSigilBonus`; `handleCollectRoundGold.ts` credits it alongside the base + hands bonuses.
- `shared/resolveSpell.ts` calls `isSynergyPair` (gates Two Pair / Full House lookups) and `looseDuosEnabled` (gates `COMBO_TABLE` fallback).
- `client/arkynAnimations.ts` calls `composeCastModifiers()` — the same shared helper the server uses — so the cast animation's numbers match the server's authoritative damage exactly. Each event in `runeBreakdown[]` carries a `sigilId` field; the cast timeline dispatches `onSigilShake(item.sigilId)` generically (no `"voltage"` / `"synapse"` / `"arcana"` strings hardcoded in the timeline).
- `client/ui/ShopPanel.tsx` reads `getPlayerStatDeltas(sigils)` for the Casts / Discards chips.
- `client/ui/SpellPreview.tsx` shows tier mult in live preview; during cast, `castMultCounter` ticks up as each additive-mult bubble fires (Synapse per held Psy, Arcana per played Arcane Cluster rune), then multiplies on the xMult event (Supercell/Eruption).
- `client/ui/EnemyHealthBar.tsx` reads `getIgnoredResistanceElements(sigils, useDisabledResistance())` and overlays a red X on matching resistance chips with a dimmed icon + swapped "1x (ignored)" tooltip. The second arg folds Binoculars' per-round pick in alongside static resist-ignore sigils.
- `client/ui/RoundEndOverlay.tsx` iterates owned end-of-round-gold sigils to render one typewriter row per sigil between the "Remaining Hands" line and the Total.

**Cast timeline + event flags** (`runeBreakdown[]` discriminated-union):
- `isProc` — Voltage/Hourglass/Fortune. Damage procs re-pop the rune's base contribution; gold procs show "+N Gold" over the gold counter.
- `isMultTick` — **Any** additive-mult event (Synapse **or** Arcana **or** any future additive-mult sigil). Carries `multDelta` + `sigilId`. The timeline handler is generic and doesn't know which sigil fired.
- `isXMult` — Supercell/Eruption. Carries `xMultFactor`; multiplies the running mult instead of adding to it. Fires AFTER all `isMultTick` events for a dramatic reveal.
- `isGold` — Fortune-style grant_gold procs. Skips Base/Mult ticks; fires the two-phase gold-counter reveal via `onGoldProcShow` + `onGoldProcCommit`.

**Hand-mult bubble overlay** (`client/ui/MultBubble.tsx`): floating "+N Mult" bubbles over held runes for Synapse. It's a **fixed-position overlay** mounted at the ArkynOverlay root (not inside HandDisplay card slots) — this decouples bubble mount/unmount from the hand card tree and avoids cascading re-renders that would otherwise churn the WebGL contexts on rune card canvases. The overlay reads `useHandMultBubbles()` and positions itself by querying `[data-rune-index="N"]` DOM positions. Arcana doesn't mount bubbles — its feedback is the mult-counter tick + Arcana sigil shake at each matching played rune's damage event.

**Adding a new sigil** (checklist):
1. Add metadata to `SIGIL_DEFINITIONS` in `sigils.ts` (id, name, rarity, cost, sellPrice, description with `{highlighted}` markers; optional `explainer` if the trigger scope isn't obvious from the description). **Multi-word ids use snake_case** (e.g. `lex_divina`, not `lex-divina`) so the registry key reads as a bare JS identifier rather than a quoted string.
2. Drop PNG assets in `assets/sigils/<id>-32x32.png`, `<id>-64x64.png`, `<id>-128x128.png` (auto-discovered by Vite glob). **The filename stem must exactly match the id** — the asset loader does a raw string lookup on `${sigilId}-${size}x${size}`, so a mismatch (even a space-for-underscore slip) shows up as a silently blank icon in the shop + sigil bar.
3. Add **one** entry to whichever category registry fits (1-9 above). If the mechanic is genuinely one-off, define a lifecycle hook in `SIGIL_LIFECYCLE_HOOKS` or propose a new category.
4. For proc sigils: assign `rngOffset: procRngSlot(N)` where N is the next unused slot (append — don't reuse or reorder existing slots, or you break replay determinism). Module-load validation will throw on collision, out-of-band, or misaligned offsets.
5. For lifecycle sigils: assign `rngOffset: lifecycleRngSlot(N)` where **N ≥ 1** (slot 0 is Thief and shares its numeric base with the Rune Bag jitter — see the latent collision warning above).

No other code changes needed for the 12 currently-implemented sigils — each is a pure data entry. Grep audit: `grep -rn 'includes("voltage"\|"synapse"\|"arcana"\|"supercell"\|"plunder")' src/plugins/plugin-arkyn` returns zero results outside the registries.

### Spell Preview Panel (`client/ui/SpellPreview.tsx`)

Left-side panel showing the current cast state. Driven by a discriminated union `PanelMode` computed once at the top — `{ kind: "empty" } | { kind: "preview", spell, sourceRunes } | { kind: "casting", spell, sourceRunes }` — which replaces what used to be three chained ternaries. Every downstream conditional (display values, rune source, JSX branch) reads from this single discriminator.

Layout:
- **Round info** (orange inner-frame chip, top)
- **Heading** ("Spell Preview" / "Casting" / "Last Cast")
- **Spell info section** (rune recipe tiles via `RuneImage`, spell name with per-element color or per-char gradient for combos via `BouncyText.colorRange`, tier, description)
- **Damage chips** (Base blue / Mult green / Total red, side-by-side row + total below):
  - Live preview (`mode.kind === "preview"`): Base = spell tier base only, Mult = tier mult (sigil bonuses — Synapse hand-mult, Arcana played-mult, Supercell/Eruption xMult — are NOT previewed; all revealed during cast), Total = "-"
  - Casting (`mode.kind === "casting"`): Base ticks from spellBase → baseTotal as each rune damage bubble pops, Mult ticks up as each `isMultTick` event fires (Synapse / Arcana) and then multiplies on the `isXMult` event (Supercell / Eruption), Total reveals via count-up after all rune + mult ticks
- **Gold counter** (inner-frame chip, pinned to bottom via `margin-top: auto`)

### Spellbook System (`shared/spellbooks.ts`)

Players have an equipped spellbook (currently hardcoded to "Standard" — no modifiers). The spellbook icon + rune count (pouch/total) display is a viewport-anchored HUD element (`PouchCounter.tsx`), positioned bottom-right.

Future spellbooks will add match-wide modifiers (e.g., +1 hand size, -1 discard, +deck size). The `SpellbookDefinition` type and `SPELLBOOKS` registry are ready for expansion.

### UI Chrome

- All panels use 9-slice `border-image` from `assets/ui/` PNG frames (`frame.png`, `inner-frame.png`, color variants `inner-frame-blue/red/green/orange/gold.png`).
- **All colored inner-frame URLs are centralized** in `styles.ts` as the `INNER_FRAME_BGS` map — keys `default | blue | green | red | orange | gold`, values are pre-wrapped `url(...)` strings. Components import `INNER_FRAME_BGS` instead of the individual PNG files, so art changes only touch `styles.ts`.
- `createPanelStyleVars(heading?)` wires `--panel-bg` (frame.png) and `--section-bg` (inner-frame.png) as CSS variables; the optional `heading` argument accepts a color name (`"blue"`, `"red"`, etc., keyed into `INNER_FRAME_BGS`) or a raw URL for the `--heading-bg` variable. Components pass custom variables for colored chips using the map (e.g., `["--base-bg"]: INNER_FRAME_BGS.blue`, `["--mult-bg"]: INNER_FRAME_BGS.green`).
- `BouncyText` component (`client/ui/BouncyText.tsx`) splits text into per-char inline-block spans with CSS keyframe bob animation (1px amplitude, 1.6s cycle, per-char phase offset). Supports `colorRange` prop for per-char color interpolation (used for combo spell name gradients).
- `OverlayShader` (`client/ui/OverlayShader.tsx`) renders a static WebGL grain + Bayer dither pattern as a translucent fixed-position canvas above all UI (z-index 9999, `mix-blend-mode: soft-light`, opacity 0.18). Rendered once on mount + on resize — no animation loop.

### Rendering Architecture — WebGL Context Budget

Browsers limit concurrent WebGL contexts (Chrome: ~16, practical ceiling ~8–12 before the oldest gets evicted). The game pools every GPU surface behind one of two shared renderers so the peak never exceeds 3 contexts:

| Component | Contexts |
|---|---|
| `BackgroundShader` | 1 |
| `sharedItemRenderer` (all sigils + scrolls) | **1 shared** |
| `sharedDissolveRenderer` (all cast runes + scroll dissolves) | **1 shared** |
| `OverlayShader` | 0 (Canvas2D) |
| **Total peak during cast** | 3 |

**Shared ItemScene renderer (`client/ui/sharedItemRenderer.ts`)**:
- One `THREE.WebGLRenderer` attached to a hidden offscreen canvas serves every sigil / scroll card in the game.
- `ItemScene.tsx` (`client/ui/ItemScene.tsx`) is a thin wrapper: it owns the visible display `<canvas>`, handles pointer events (tilt), and registers with the shared renderer on mount. The display canvas uses a plain 2D context and receives rendered frames via `drawImage`.
- Per-frame, the render loop iterates registered items, sets per-item uniforms (`uTexture`, `uTilt`, `uTime`) and mesh rotation, calls `renderer.setSize(cssW, cssH, false)` only when dimensions change, renders the shared scene, then blits the offscreen buffer to the item's display canvas pixel-perfect 1:1.
- Item sizes are cached via `ResizeObserver` to avoid per-frame `getBoundingClientRect` reads.
- Texture cache keyed by URL (reusing a module-level `THREE.TextureLoader`); each sigil/scroll image loads once, reused across all instances. `disposeAllTextures()` is exported for plugin teardown.
- Exposes `registerItemScene({ canvas, imageUrl, index, tiltTargetRef }) → unregister()`.

**Shared Dissolve renderer (`client/ui/sharedDissolveRenderer.ts`)**:
- One raw-WebGL context + two compiled programs (dual-texture for runes, single-texture for scrolls) serves every concurrent dissolve.
- `DissolveCanvas.tsx` is a thin wrapper: it renders a visible `<canvas>` (2D context) and registers with the shared renderer. Props are unchanged (`element`, `startTime`, `duration`, `rune?|imageUrl?`, `size?`).
- Per-frame, the loop iterates active slots: computes `t = (now - startTime) / duration`, gates on textures being loaded, binds the right program, sets `uThreshold` + `uEdgeColor` + texture samplers, draws to offscreen, blits to the slot's display canvas via `drawImage`. On slot completion (`t >= 1`) it hides the display canvas (`visibility: hidden; display: none`) exactly as the old per-instance component did.
- Texture cache keyed by URL; rune base/element textures are reused across all slots + every cast.
- Exposes `registerDissolve({ canvas, element, startTime, duration, rune?|imageUrl?, size? }) → unregister()` and `disposeAllDissolveTextures()`.
- Replaces a previous pattern that created one WebGL context per DissolveCanvas instance — with dissolve canvases now pre-mounted at cast start (to avoid a fly → dissolve handoff flicker), up to 6 concurrent contexts were possible, regularly triggering background-context eviction.

**OverlayShader (`client/ui/OverlayShader.tsx`)**:
- Static grain + 4×4 Bayer dither pattern rendered into a fixed-position canvas via Canvas2D `putImageData`. Same math as the old GLSL shader — `hash(x,y) = fract(sin(x*127.1 + y*311.7) * 43758.5453123)` + Bayer lookup — just executed in JS. Rendered once on mount + on each resize. No animation loop, no WebGL context.

**Dissolve flicker prevention — pre-mount pattern**:
- Dissolving runes are mounted at cast start (`arkynAnimations.ts:onStart`, not at fly-complete) so the shared renderer has the entire fly window to decode textures and paint the first frame.
- `PlayArea` wraps the runeShake div with `opacity: flyingRunes.length === 0 ? 1 : 0` — keeps the pre-mounted dissolve layer invisible while flyers are still in transit, then flips to visible in the same tick the flyers unmount.
- The dissolve shader gates the edge-glow band on `uThreshold > 0.001` so the pre-dissolve render is pixel-identical to a plain `<RuneImage>` — no element-colored tint during the idle pre-dissolve hold.

**BackgroundShader graceful degradation**:
- Uses `alpha: true` with a CSS `background-color: #1a1530` fallback on the canvas so if its context is lost the user sees a dimmed fallback instead of a white flash.
- Listens for `webglcontextlost` (pauses render loop, logs warning) and `webglcontextrestored` (resumes).

**If you're adding another WebGL surface**: check the context budget table above. Prefer routing through an existing shared renderer if possible. If the new surface is fully static (no animation, no per-frame uniform updates), prefer Canvas2D + `putImageData` like OverlayShader — no context at all. If you must add a new WebGL context, ensure it has a CSS fallback (like BackgroundShader) so context eviction degrades gracefully.

### Shop Item System (`server/systems/handleBuyItem.ts`, `shopItemHandlers.ts`)

Shop purchases dispatch through a data-driven handler registry parallel to the sigil effect registries — `handleBuyItem` validates the request (gold, shop index, item not-already-purchased) then looks up the item's handler in `SHOP_ITEM_HANDLERS`. Each handler runs its own type-specific preconditions and state mutations; the dispatcher charges gold and flips `item.purchased = true` **only after** the handler returns `{ ok: true }`. There is no refund path — gold is never deducted on failure.

**Registry** (`server/systems/shopItemHandlers.ts`):
```ts
type ShopItemHandler = (ctx: ShopPurchaseCtx) =>
    | { ok: true; logMessage: string }
    | { ok: false; reason: string };

const SHOP_ITEM_HANDLERS: Record<string, ShopItemHandler> = {
    scroll:  handleScrollPurchase,
    sigil:   handleSigilPurchase,
    runeBag: handleRuneBagPurchase,
};
```

**Adding a new shop item type** (checklist):
1. Add the item type string to the generator that populates `player.shopItems` (`shared/shopGeneration.ts` or new site).
2. Add a handler function in `shopItemHandlers.ts` that validates preconditions (slot limits, duplicates, etc.) and applies the state mutation. Return `{ ok: true, logMessage }` on success or `{ ok: false, reason }` on precondition fail.
3. Register in `SHOP_ITEM_HANDLERS` keyed by the item type string.
4. No changes to `handleBuyItem.ts` — the dispatcher is generic.

### Rune Bag System (`server/systems/handleBuyItem.ts`, `handleBagChoice.ts`, `client/ui/RuneBagPicker.tsx`)

Shop item that rolls a picker of 4 random runes; player picks one (or skips) and the chosen rune is added permanently to their pouch.

**Flow**:
1. Player buys a bag in the shop (`RUNE_BAG_COST = 4` gold). `handleBuyItem` calls `rollBagRunes(runSeed, round, bagPurchaseCount)` to roll 4 deterministic-seeded runes and stores them on `player.pendingBagRunes`.
2. Client sees `pendingBagRunes.length > 0` and mounts `RuneBagPicker.tsx` over the shop — shows 4 rune cards with Select / Skip buttons.
3. Player clicks a rune → `ARKYN_PICK_BAG_RUNE { index }` → `handleBagChoice` appends to `player.acquiredRunes` (run-stat record) + pushes the rune into the live `player.pouch` (immediate sync so `PouchCounter` ticks +1 right away). Clears `pendingBagRunes`.
4. Player clicks Skip → same message with `index: null` → just clears `pendingBagRunes`. No refund.

**Constants** (`shared/arkynConstants.ts`):
- `RUNE_BAG_COST = 4`
- `SHOP_RUNE_BAG_COUNT = 1` — 1 bag slot per shop visit
- `RUNE_BAG_CHOICES = 4` — 4 runes per picker
- `MAX_RUNE_BAGS_PER_SHOP = 1` — can't re-buy after picking
- `RUNE_BAG_RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 12, legendary: 3 }` — cumulative-weighted roll per choice slot. Element is uniform random across all 13 `ELEMENT_TYPES`.

**Determinism**: `rollBagRunes` seeds from `(runSeed, round, bagPurchaseCount)` so a re-mount (page refresh, re-join) produces the same 4 choices. This matters because `pendingBagRunes` is stored on the server schema and survives reconnect.

### Rune Rarity System

Runes have four rarities: `common`, `uncommon`, `rare`, `legendary` (see `RARITY_TYPES` in `arkynConstants.ts`). Rarity is the only vector that currently differentiates runes of the same element — higher-rarity runes contribute more base damage per cast:

- `RUNE_BASE_DAMAGE = { common: 8, uncommon: 12, rare: 18, legendary: 30 }` (in `spellTable.ts`). Used per-rune inside `calculateSpellDamage` alongside scroll bonuses and resist/weak modifiers.
- Starting pouch (`createPouch.ts`) is all common rarity. Higher rarities enter the run **only via Rune Bags** — see the weighted roll above.
- Rarity is visually stacked in `RuneImage.tsx`: a base frame PNG (`/assets/runes/128x128/base/<rarity>-128x128.png`) is rendered underneath the element glyph PNG (`/assets/runes/128x128/<element>-128x128.png`). Both are CSS-sized identically so rarity reads as the card's frame treatment.
- The Rune Bag picker (`RuneBagPicker.tsx`) shows the full composed art so players can see the rarity frame before choosing.

**Rune construction — single factory**: Every `RuneInstance` is built through `createRuneInstance(data)` in `server/utils/drawRunes.ts`. The factory validates `data.rarity` via `isRarity()` (exported from `arkynConstants.ts`) and throws on an invalid value, so the `as RarityType` casts elsewhere in the damage pipeline are safe-by-construction. Three call sites (draw, rune bag purchase, bag pick commit) all route through this one factory — adding a new field to `RuneInstance` is a single-file change.

**Future expansion**: `RUNE_BASE_DAMAGE` is a simple dict so per-rarity tuning is a one-line change. Other rarity-gated mechanics (unique rune art, rare-only scroll interactions, etc.) can key off the same `rarity` field on `RuneInstance`.

### Consumable System (`shared/consumables.ts`, `server/systems/handleUseConsumable.ts`, `client/ui/ConsumableBar.tsx`)

Consumables are one-shot items the player carries in the Consumable Bar (up to `MAX_CONSUMABLES = 2`). Today every consumable is a per-element scroll consumable (one per element) that grants +1 scroll level when used; the system is data-driven so future kinds (potions, run-wide buffs) slot in as new effect arms with zero dispatcher changes.

**Registry** (`shared/consumables.ts`):
```ts
type ConsumableEffect =
    | { type: "upgradeScroll"; element: string };

interface ConsumableDefinition {
    id: string;        // registry key; equals the value stored in `player.consumables`
    name: string;      // display name for the tooltip
    effect: ConsumableEffect;
}

const CONSUMABLE_DEFINITIONS: Record<string, ConsumableDefinition>;  // auto-populated per ELEMENT_TYPES
```

`player.consumables` is an `ArraySchema<string>` of consumable IDs. For scroll consumables the ID equals the element name (fire, water, …), so the persisted shape is unchanged from the pre-refactor code. New consumable kinds should pick IDs that won't collide with element names (e.g. `"potion_haste"`).

**Dispatch** (`server/systems/handleUseConsumable.ts`): looks up the consumable's `ConsumableEffect`, switches over `effect.type`, applies the mutation, removes from the array. New effect types add as new switch arms.

**Adding a new consumable** (checklist):
1. Add metadata to `CONSUMABLE_DEFINITIONS` in `shared/consumables.ts` (id, name, effect). If the effect shape doesn't fit the existing union, add a new arm to `ConsumableEffect`.
2. Add the matching case to the switch in `handleUseConsumable.ts`.
3. If granted by a sigil lifecycle hook, return `{ type: "grantConsumable", consumableId: "<id>" }` from the hook.
4. For non-scroll consumables, add icon asset handling — `ConsumableBar.tsx` currently falls back to the element-as-icon for `upgradeScroll` effects; new effect kinds need their own icon resolution path.

### Enemy System

- Enemies are defined in `server/utils/enemyDefinitions.ts` — round-indexed stat blocks (name, HP, element, resistances, weaknesses).
- Enemy info is displayed above the health bar: name label, health bar with animated fill + stepped color transitions, floating damage number on impact (GSAP shake + pop), and Resists/Weak To chips below the bar.
- **HP values are tuned for the old damage formula** and need a balancing pass for the new Base + Mult curve.

### Key Constants (`shared/arkynConstants.ts`, `shared/spellTable.ts`)

| Constant | Value | Notes |
|---|---|---|
| `HAND_SIZE` | 8 | Runes drawn per round |
| `MAX_PLAY` | 5 | Max runes per cast |
| `POUCH_SIZE` | 52 | Total runes in starting pouch (13 elements × 4) |
| `RUNES_PER_ELEMENT` | 4 | Per-element copies in starting pouch |
| `ELEMENT_TYPES` | 13 | air, arcane, death, earth, fire, holy, ice, lightning, poison, psy, shadow, steel, water |
| `RARITY_TYPES` | 4 | common, uncommon, rare, legendary |
| `COMBINABLE_ELEMENTS` | 6 | fire, water, earth, air, ice, lightning — valid for loose-duo combos via Fuze |
| `ARCANE_CLUSTER_ELEMENTS` | 7 | arcane, psy, shadow, holy, death, poison, steel — Arcana trigger set (see Grimoire for synergy pairs) |
| `SPELL_TIER_BASE_DAMAGE` | [0,4,8,12,16,20] | Per-tier flat base |
| `SPELL_TIER_MULT` | [0,1,2,3,4,5] | Per-tier multiplier |
| `RUNE_BASE_DAMAGE` | { common: 8, uncommon: 12, rare: 18, legendary: 30 } | Per-rune base contribution by rarity |
| `SCROLL_RUNE_BONUS` | 2 | Per-rune flat base added per scroll level (applied before resist/weak mod) |
| `MAX_SIGILS` | 6 | Max sigils a player can hold at once |
| `MAX_CONSUMABLES` | 2 | Max consumable items (e.g. Thief-granted scrolls) |
| `CASTS_PER_ROUND` | 3 | Cast budget (Caster sigil adds +1) |
| `DISCARDS_PER_ROUND` | 3 | Discard budget |
| `RUNE_BAG_COST` | 4 | Gold cost per bag in the shop |
| `RUNE_BAG_CHOICES` | 4 | Runes shown in the picker per bag |
| `RUNE_BAG_RARITY_WEIGHTS` | common 60, uncommon 25, rare 12, legendary 3 | Cumulative weights for each bag choice slot |

### Element Colors (`client/ui/styles.ts`)

Each element has a display color used for spell names, rune recipe borders, damage number strokes, etc. Death = crimson red (`#dc143c`), Fire = red-orange (`#ff5722`). Full map in `ELEMENT_COLORS`.

---

## Future Gameplay — Notes for Implementation

### Shop Content Ideas (`client/ui/ShopScreen.tsx`, `server/systems/handleBuyItem.ts`)

Between rounds the player enters the shop and can buy scrolls (per-element flat base damage), sigils (run-wide modifiers), and Rune Bags. Scrolls live in `player.scrollLevels` and are applied per-rune inside `calculateSpellDamage`; sigils dispatch through the registries (see **Sigil System**); rune bags roll deterministic picker choices (see **Rune Bag System**). All item types dispatch through the `SHOP_ITEM_HANDLERS` registry (see **Shop Item System**), so adding a new item type doesn't require touching `handleBuyItem.ts`.

**Future sigil ideas** would typically slot into one of the 9 existing category registries (stat-mod / proc / hand-mult / lifecycle / synergy-unlock / spell-xMult / resist-ignore / end-of-round-gold / played-mult) as a single data entry. Only genuinely novel mechanics need a new category.

**Future consumable ideas** (potions, one-shot buffs) slot into `CONSUMABLE_DEFINITIONS` as new entries, with new arms added to the `ConsumableEffect` union as needed. See **Consumable System**.

### All-Runes-Score Item

**Concept**: A shop item that makes ALL played runes contribute to scoring, regardless of whether they match the resolved spell's contributing elements.

**What it does**: Currently, non-contributing runes (e.g., the water rune in a 3-Fire+1-Water cast → Inferno Wave Tier 3) are consumed but deal no damage. This item would make every played rune add its base damage to the Base counter, even if it doesn't match the spell's element.

**Implementation notes**: Modify `getContributingRuneIndices` in `resolveSpell.ts` to return ALL indices when the flag is set, instead of filtering by element match.

### Enemy HP Rebalancing

The current enemy HP values in `server/utils/enemyDefinitions.ts` were tuned for the old linear damage formula (`8 × tier`). The new Base + Mult curve produces significantly higher damage at all tiers (T1: 12 vs 8, T2: 48 vs 16, T5: 300 vs 40). Enemy HP needs a balancing pass once the new damage numbers feel right in playtesting.

### Spellbook Selection

Currently hardcoded to `DEFAULT_SPELLBOOK_ID = "standard"`. Future: let players choose a spellbook before the match (or purchase new ones from the shop). Each spellbook would define modifiers via fields on `SpellbookDefinition` (e.g., `handSizeModifier`, `discardModifier`, `deckSizeModifier`). The `SPELLBOOKS` registry in `shared/spellbooks.ts` and the asset loader in `client/ui/spellbookAssets.ts` are ready for expansion — just add new entries and asset folders.

