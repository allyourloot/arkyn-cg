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

### Cast Animation Pipeline (client)

1. `castSpell()` in `arkynAnimations.ts` calls `calculateSpellDamage` client-side (same shared formula → identical numbers).
2. Builds per-rune `runeBreakdown[]` and passes it + `spellBaseDamage` + `totalDamage` to `buildCastTimeline()`.
3. The GSAP timeline orchestrates: fly runes to play area → settle → raise contributing slots → per-rune damage bubbles pop (staggered) while the Base counter ticks in the Spell Preview → dissolve shader tears runes apart → total damage count-up reveal (0.5s GSAP tween) → enemy floating damage number + HP bar shake → cleanup.
4. Key store fields: `castBaseCounter` (live Base tick), `castTotalDamage` (live Total count-up, sentinel `-1` until reveal), `lastCastBaseDamage` (snapshot for Last Cast view).

### Sigil System (`shared/sigilEffects.ts`, `shared/sigils.ts`)

Sigils are shop-purchased items that modify a run. **12 sigils are implemented today** across **9 effect categories**, and the system is designed to scale to 50+ via **data-driven effect registries** — adding most new sigils is a single data entry, zero code branches.

**Two files, clear separation of concerns:**
- `shared/sigils.ts` — `SIGIL_DEFINITIONS: Record<string, SigilDefinition>` with metadata (id, name, rarity, description with `{highlighted}` markers, cost, sellPrice, optional `explainer` showing trigger-element icons in the tooltip).
- `shared/sigilEffects.ts` — category-based registries for mechanics, plus pure helpers consumers call generically.

**Nine effect categories.** A sigil can appear in multiple (e.g. a future "+1 cast AND 10% fire proc" sigil would have entries in both `SIGIL_STAT_MODIFIERS` and `SIGIL_PROCS`).

| # | Category | Registry | Helper | Sigils |
|---|---|---|---|---|
| 1 | Stat modifiers | `SIGIL_STAT_MODIFIERS` | `getPlayerStatDeltas(sigils)` | Caster: `{ castsPerRound: 1 }` |
| 2 | RNG procs on played runes | `SIGIL_PROCS` | `iterateProcs(sigils, elements, seed, round, cast, isCritical?)` | Voltage (25% on lightning → double_damage), Fortune (33% on critical → +2 gold), Hourglass (25% any element → double_damage) |
| 3 | Hand-based mult | `SIGIL_HAND_MULT` | `getHandMultBonus(sigils, hand, excluded)` | Synapse: `{ element: "psy", multPerRune: 2 }` |
| 4 | Lifecycle hooks | `SIGIL_LIFECYCLE_HOOKS` | `hooks.onRoundStart(round, seed)` | Thief (onRoundStart → grants random scroll consumable) |
| 5 | Resolver synergy/feature unlocks | `SIGIL_SYNERGY_PAIRS` (in `spellTable.ts`), `SIGIL_LOOSE_DUO_UNLOCKS` | `isSynergyPair(a, b, sigils)`, `looseDuosEnabled(sigils)` | Burnrite (unlocks `"death+fire"` synergy), Fuze (unlocks loose-duo combos for any 2 combinable elements) |
| 6 | Spell-element xMult | `SIGIL_SPELL_X_MULT` | `getSpellXMult(sigils, spellElements)` | Supercell (lightning/air spells × 3), Eruption (fire/earth spells × 3) |
| 7 | Resistance ignore | `SIGIL_RESIST_IGNORE` | `getIgnoredResistanceElements(sigils)` | Impale (`["steel"]` — nullifies enemy steel resistance) |
| 8 | End-of-round gold | `SIGIL_END_OF_ROUND_GOLD` | `getEndOfRoundSigilGold(sigils)` | Plunder (`{ amount: 5 }`) |
| 9 | Played-rune mult | `SIGIL_PLAYED_MULT` | `getPlayedMultBonus(sigils, contributingRunes)` | Arcana (`{ elements: ARCANE_CLUSTER_ELEMENTS, multPerRune: 2 }`) |

**Additive vs multiplicative mult**: Categories 3 (hand-mult) and 9 (played-mult) both feed the additive `bonusMult` channel; their values sum. Category 6 (spell xMult) is multiplicative and applies AFTER the additive sum: `finalMult = (tierMult + bonusMult) × xMult`. Proc damage from Voltage/Hourglass uses the same final mult, so additive + multiplicative sigils stack cleanly with procs.

**Proc RNG determinism**: Each proc entry carries a unique `rngOffset` (Voltage = 300000, Fortune = 310000, Hourglass = 320000; Thief's lifecycle hook uses 400000). Server and client both use `createRoundRng(runSeed, rngOffset + round * 10 + castNumber)` so they agree byte-for-byte on which runes proc. Module-load validation throws if two procs share an offset.

**Where the registries plug in:**
- `server/utils/initPlayerForRound.ts` applies `getPlayerStatDeltas(sigils)` and iterates `SIGIL_LIFECYCLE_HOOKS` for `onRoundStart` effects (e.g. Thief's consumable grant).
- `server/utils/calculateDamage.ts` composes all damage-phase registries: `getHandMultBonus` + `getPlayedMultBonus` → `bonusMult`, `getSpellXMult` → `xMult`, `getIgnoredResistanceElements` → filters the resistances array, and loops `iterateProcs(...)` for proc damage/gold.
- `server/systems/handleCast.ts` calls `getEndOfRoundSigilGold(sigils).total` on the killing blow and stages it into `player.lastRoundGoldSigilBonus`; `handleCollectRoundGold.ts` credits it alongside the base + hands bonuses.
- `shared/resolveSpell.ts` calls `isSynergyPair` (gates Two Pair / Full House lookups) and `looseDuosEnabled` (gates `COMBO_TABLE` fallback).
- `client/arkynAnimations.ts` (`castSpell`) mirrors every server registry so the cast animation's numbers match the server's authoritative damage exactly. Each event in `runeBreakdown[]` carries a `sigilId` field — the cast timeline dispatches `onSigilShake(item.sigilId)` generically (no `"voltage"` / `"synapse"` / `"arcana"` strings hardcoded in the timeline).
- `client/ui/ShopPanel.tsx` reads `getPlayerStatDeltas(sigils)` for the Casts / Discards chips.
- `client/ui/SpellPreview.tsx` shows tier mult in live preview; during cast, `castMultCounter` ticks up as each additive-mult bubble fires (Synapse per held Psy, Arcana per played Arcane Cluster rune), then multiplies on the xMult event (Supercell/Eruption).
- `client/ui/EnemyHealthBar.tsx` reads `getIgnoredResistanceElements(sigils)` and overlays a red X on matching resistance chips with a dimmed icon + swapped "1x (ignored)" tooltip.
- `client/ui/RoundEndOverlay.tsx` iterates owned end-of-round-gold sigils to render one typewriter row per sigil between the "Remaining Hands" line and the Total.

**Cast timeline + event flags** (`runeBreakdown[]` discriminated-union):
- `isProc` — Voltage/Hourglass/Fortune. Damage procs re-pop the rune's base contribution; gold procs show "+N Gold" over the gold counter.
- `isMultTick` — **Any** additive-mult event (Synapse **or** Arcana **or** any future additive-mult sigil). Carries `multDelta` + `sigilId`. The timeline handler is generic and doesn't know which sigil fired.
- `isXMult` — Supercell/Eruption. Carries `xMultFactor`; multiplies the running mult instead of adding to it. Fires AFTER all `isMultTick` events for a dramatic reveal.
- `isGold` — Fortune-style grant_gold procs. Skips Base/Mult ticks; fires the two-phase gold-counter reveal via `onGoldProcShow` + `onGoldProcCommit`.

**Hand-mult bubble overlay** (`client/ui/MultBubble.tsx`): floating "+N Mult" bubbles over held runes for Synapse. It's a **fixed-position overlay** mounted at the ArkynOverlay root (not inside HandDisplay card slots) — this decouples bubble mount/unmount from the hand card tree and avoids cascading re-renders that would otherwise churn the WebGL contexts on rune card canvases. The overlay reads `useHandMultBubbles()` and positions itself by querying `[data-rune-index="N"]` DOM positions. Arcana doesn't mount bubbles — its feedback is the mult-counter tick + Arcana sigil shake at each matching played rune's damage event.

**Adding a new sigil** (checklist):
1. Add metadata to `SIGIL_DEFINITIONS` in `sigils.ts` (id, name, rarity, cost, sellPrice, description with `{highlighted}` markers; optional `explainer` if the trigger scope isn't obvious from the description).
2. Drop PNG assets in `assets/sigils/<id>-32x32.png`, `<id>-64x64.png`, `<id>-128x128.png` (auto-discovered by Vite glob).
3. Add **one** entry to whichever category registry fits (1-9 above). If the mechanic is genuinely one-off, define a lifecycle hook in `SIGIL_LIFECYCLE_HOOKS` or propose a new category.
4. For proc sigils: pick a new unique `rngOffset` (e.g. 330000, 340000) so deterministic RNG stays collision-free.

No other code changes needed for the 12 currently-implemented sigils — each is a pure data entry. Grep audit: `grep -rn 'includes("voltage"\|"synapse"\|"arcana"\|"supercell"\|"plunder")' src/plugins/plugin-arkyn` returns zero results outside the registries.

### Spell Preview Panel (`client/ui/SpellPreview.tsx`)

Left-side panel showing:
- **Round info** (orange inner-frame chip, top)
- **Heading** ("Spell Preview" / "Casting" / "Last Cast")
- **Spell info section** (rune recipe tiles via `RuneImage`, spell name with per-element color or per-char gradient for combos via `BouncyText.colorRange`, tier, description)
- **Damage chips** (Base blue / Mult green / Total red, side-by-side row + total below):
  - Live preview: Base = spell tier base only, Mult = tier mult (sigil bonuses — Synapse hand-mult, Arcana played-mult, Supercell/Eruption xMult — are NOT previewed; all revealed during cast), Total = "-"
  - Casting: Base ticks from spellBase → baseTotal as each rune damage bubble pops, Mult ticks up as each `isMultTick` event fires (Synapse / Arcana) and then multiplies on the `isXMult` event (Supercell / Eruption), Total reveals via count-up after all rune + mult ticks
  - Last Cast: Base = snapshot, Mult = tier mult, Total = snapshot × mult
- **Gold counter** (inner-frame chip, pinned to bottom via `margin-top: auto`)

### Spellbook System (`shared/spellbooks.ts`)

Players have an equipped spellbook (currently hardcoded to "Standard" — no modifiers). The spellbook icon + rune count (pouch/total) display is a viewport-anchored HUD element (`PouchCounter.tsx`), positioned bottom-right.

Future spellbooks will add match-wide modifiers (e.g., +1 hand size, -1 discard, +deck size). The `SpellbookDefinition` type and `SPELLBOOKS` registry are ready for expansion.

### UI Chrome

- All panels use 9-slice `border-image` from `assets/ui/` PNG frames (`frame.png`, `inner-frame.png`, color variants `inner-frame-blue/red/green/orange.png`).
- `createPanelStyleVars()` in `styles.ts` wires `--panel-bg` (frame.png) and `--section-bg` (inner-frame.png) as CSS variables; components pass custom variables for colored chips (e.g., `--base-bg`, `--mult-bg`, `--total-bg`, `--round-info-bg`).
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

**Future expansion**: `RUNE_BASE_DAMAGE` is a simple dict so per-rarity tuning is a one-line change. Other rarity-gated mechanics (unique rune art, rare-only scroll interactions, etc.) can key off the same `rarity` field on `RuneInstance`.

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

### Shop (implemented; `client/ui/ShopScreen.tsx`, `server/systems/handleBuyItem.ts`)

Between rounds the player enters the shop and can buy scrolls (per-element flat base damage) and sigils (run-wide modifiers). Both are persisted in the player state for the rest of the run. See the **Sigil System** subsection above for how sigil effects dispatch through the registries; scrolls live in `player.scrollLevels` and are applied per-rune inside `calculateSpellDamage`.

**Future sigil ideas** would typically slot into one of the 9 existing category registries (stat-mod / proc / hand-mult / lifecycle / synergy-unlock / spell-xMult / resist-ignore / end-of-round-gold / played-mult) as a single data entry. Only genuinely novel mechanics need a new category.

### All-Runes-Score Item

**Concept**: A shop item that makes ALL played runes contribute to scoring, regardless of whether they match the resolved spell's contributing elements.

**What it does**: Currently, non-contributing runes (e.g., the water rune in a 3-Fire+1-Water cast → Inferno Wave Tier 3) are consumed but deal no damage. This item would make every played rune add its base damage to the Base counter, even if it doesn't match the spell's element.

**Implementation notes**: Modify `getContributingRuneIndices` in `resolveSpell.ts` to return ALL indices when the flag is set, instead of filtering by element match.

### Enemy HP Rebalancing

The current enemy HP values in `server/utils/enemyDefinitions.ts` were tuned for the old linear damage formula (`8 × tier`). The new Base + Mult curve produces significantly higher damage at all tiers (T1: 12 vs 8, T2: 48 vs 16, T5: 300 vs 40). Enemy HP needs a balancing pass once the new damage numbers feel right in playtesting.

### Spellbook Selection

Currently hardcoded to `DEFAULT_SPELLBOOK_ID = "standard"`. Future: let players choose a spellbook before the match (or purchase new ones from the shop). Each spellbook would define modifiers via fields on `SpellbookDefinition` (e.g., `handSizeModifier`, `discardModifier`, `deckSizeModifier`). The `SPELLBOOKS` registry in `shared/spellbooks.ts` and the asset loader in `client/ui/spellbookAssets.ts` are ready for expansion — just add new entries and asset folders.

