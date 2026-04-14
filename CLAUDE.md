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

**Loose duo combos** (`COMBO_TABLE`) are **intentionally disabled** in the base game. The content is preserved for a future shop-item unlock (see Future Gameplay below). The resolver branch is commented out in `resolveSpell.ts` with a `NOTE:` explaining how to re-enable it.

### Damage Model — Base + Mult (`shared/calculateDamage.ts`)

Balatro-style chip × mult system:

```
baseTotal   = SPELL_TIER_BASE_DAMAGE[tier] + Σ (RUNE_BASE_DAMAGE[rarity] × resistMod)
finalDamage = baseTotal × (SPELL_TIER_MULT[tier] + bonusMult)
```

- `SPELL_TIER_BASE_DAMAGE = [0, 4, 8, 12, 16, 20]` — flat per-tier base.
- `SPELL_TIER_MULT = [0, 1, 2, 3, 4, 5]` — flat per-tier multiplier.
- `RUNE_BASE_DAMAGE = { common: 8, uncommon: 8, rare: 8, legendary: 8 }` — per-rune contribution by rarity (all 8 today; tunable per-rarity later).
- Per-rune `resistMod`: ×1.5 if enemy is weak to that rune's element, ×0.5 if resistant, ×1.0 neutral.
- `calculateSpellDamage(spell, runes, rarities, resistances, weaknesses, scrollLevels?, bonusMult?)` returns the full `SpellDamageBreakdown` (spellBase, runeBaseContributions, baseTotal, mult, finalDamage, per-rune crit/resist flags). `scrollLevels` adds per-element flat base damage; `bonusMult` is added to tier mult (used for Synapse-style hand-mult sigils).
- Server calls `calculateDamage(...)` (returns just `finalDamage`) from `handleCast.ts`.

### Cast Animation Pipeline (client)

1. `castSpell()` in `arkynAnimations.ts` calls `calculateSpellDamage` client-side (same shared formula → identical numbers).
2. Builds per-rune `runeBreakdown[]` and passes it + `spellBaseDamage` + `totalDamage` to `buildCastTimeline()`.
3. The GSAP timeline orchestrates: fly runes to play area → settle → raise contributing slots → per-rune damage bubbles pop (staggered) while the Base counter ticks in the Spell Preview → dissolve shader tears runes apart → total damage count-up reveal (0.5s GSAP tween) → enemy floating damage number + HP bar shake → cleanup.
4. Key store fields: `castBaseCounter` (live Base tick), `castTotalDamage` (live Total count-up, sentinel `-1` until reveal), `lastCastBaseDamage` (snapshot for Last Cast view).

### Sigil System (`shared/sigilEffects.ts`, `shared/sigils.ts`)

Sigils are shop-purchased items that modify a run. Four are implemented today (Voltage, Burnrite, Caster, Synapse) and the system is designed to scale to 50+ via **data-driven effect registries** — adding most new sigils is a single data entry, zero code branches.

**Two files, clear separation of concerns:**
- `shared/sigils.ts` — `SIGIL_DEFINITIONS: Record<string, SigilDefinition>` with metadata (id, name, rarity, description, cost, sellPrice).
- `shared/sigilEffects.ts` — category-based registries for mechanics, plus pure helpers consumers call generically.

**Four effect categories** cover the common patterns. A sigil can appear in multiple (e.g. a future "+1 cast AND 10% fire proc" sigil would have entries in both `SIGIL_STAT_MODIFIERS` and `SIGIL_PROCS`).

| Category | Registry | Helper | Example |
|---|---|---|---|
| Stat modifiers | `SIGIL_STAT_MODIFIERS` | `getPlayerStatDeltas(sigils)` | Caster: `{ castsPerRound: 1 }` |
| RNG procs on played runes | `SIGIL_PROCS` | `iterateProcs(sigils, elements, seed, round, cast)` | Voltage: 25% on Lightning → double_damage |
| Hand-based mult | `SIGIL_HAND_MULT` | `getHandMultBonus(sigils, hand, excluded)` | Synapse: `{ element: "psy", multPerRune: 2 }` |
| Synergy unlocks | `SIGIL_SYNERGY_PAIRS` (in `spellTable.ts`) | `isSynergyPair(a, b, sigils)` | Burnrite: unlocks `"death+fire"` combos |

**Escape hatch**: `SIGIL_LIFECYCLE_HOOKS` registry is reserved for truly unique one-off effects that don't fit a category (empty today). Add hook signatures (`onDiscard`, `onCastStart`, etc.) as those sigils are designed.

**Proc RNG determinism**: Each proc entry carries a unique `rngOffset` (e.g. Voltage = 300000). Server and client both use `createRoundRng(runSeed, rngOffset + round * 10 + castNumber)` so they agree byte-for-byte on which runes proc. Module-load validation throws if two procs share an offset — catches "oops" at startup.

**Where the registries plug in:**
- `server/utils/initPlayerForRound.ts` applies `getPlayerStatDeltas(sigils)` to all stat fields (castsRemaining, discardsRemaining, handSize).
- `server/utils/calculateDamage.ts` uses `getHandMultBonus(...)` to pass `bonusMult` into the shared formula, and loops `iterateProcs(...)` for proc damage. Signature takes `hand` + `selectedIndices` (not a pre-counted `heldPsyCount`) so it works for any hand-mult sigil.
- `client/arkynAnimations.ts` (`castSpell`) mirrors the server's proc + hand-mult logic for the animation layer. Each proc/synapse event in `runeBreakdown[]` carries a `sigilId` field — the cast timeline dispatches `onSigilShake(item.sigilId)` generically (no `"voltage"` or `"synapse"` strings hardcoded in the timeline).
- `client/ui/ShopPanel.tsx` reads `getPlayerStatDeltas(sigils)` for the Casts / Discards chips so any future stat sigil auto-updates the display.
- `client/ui/SpellPreview.tsx` shows tier mult in live preview; during cast, `castMultCounter` ticks up as each hand-mult bubble fires (driven by the timeline's `onMultTick` callback).

**Cast timeline + hand-mult bubbles**:
- `runeBreakdown[]` is a discriminated-union array with entries flagged `isProc` (Voltage-style) or `isSynapse` (hand-mult). Synapse entries carry `multDelta` so the timeline can tick `castMultCounter` per-event.
- `client/ui/MultBubble.tsx` renders the floating "+N Mult" bubbles over held runes. It's a **fixed-position overlay** mounted at the ArkynOverlay root (not inside HandDisplay card slots) — this decouples bubble mount/unmount from the hand card tree and avoids cascading re-renders that would otherwise churn the WebGL contexts on rune card canvases. The overlay reads `useHandMultBubbles()` and positions itself by querying `[data-rune-index="N"]` DOM positions.

**Adding a new sigil** (checklist):
1. Add metadata to `SIGIL_DEFINITIONS` in `sigils.ts` (id, name, rarity, cost, sellPrice, description — with `{highlighted}` markers for the tooltip).
2. Drop PNG assets in `assets/sigils/<id>-32x32.png`, `<id>-64x64.png`, `<id>-128x128.png` (auto-discovered by Vite glob).
3. Add **one** entry to whichever category registry fits (stat-mod / proc / hand-mult / synergy). If it's truly one-off, define a lifecycle hook instead.
4. For proc sigils: pick a new unique `rngOffset` (e.g. 310000, 320000) so deterministic RNG stays collision-free.

No other code changes needed for 90%+ of sigils. The grep audit proof: `grep -rn 'includes("voltage"\|"synapse"\|"caster"\|"burnrite")' src/plugins/plugin-arkyn` returns zero results outside the registries.

### Spell Preview Panel (`client/ui/SpellPreview.tsx`)

Left-side panel showing:
- **Round info** (orange inner-frame chip, top)
- **Heading** ("Spell Preview" / "Casting" / "Last Cast")
- **Spell info section** (rune recipe tiles via `RuneImage`, spell name with per-element color or per-char gradient for combos via `BouncyText.colorRange`, tier, description)
- **Damage chips** (Base blue / Mult green / Total red, side-by-side row + total below):
  - Live preview: Base = spell tier base only, Mult = tier mult (Synapse bonus is NOT previewed — revealed during cast), Total = "-"
  - Casting: Base ticks from spellBase → baseTotal, Mult ticks up as each Synapse bubble fires (if no hand-mult sigil, stays at tier mult), Total reveals via count-up after all rune + mult ticks
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

### Enemy System

- Enemies are defined in `server/utils/enemyDefinitions.ts` — round-indexed stat blocks (name, HP, element, resistances, weaknesses).
- Enemy info is displayed above the health bar: name label, health bar with animated fill + stepped color transitions, floating damage number on impact (GSAP shake + pop), and Resists/Weak To chips below the bar.
- **HP values are tuned for the old damage formula** and need a balancing pass for the new Base + Mult curve.

### Key Constants (`shared/arkynConstants.ts`, `shared/spellTable.ts`)

| Constant | Value | Notes |
|---|---|---|
| `HAND_SIZE` | 8 | Runes drawn per round |
| `MAX_PLAY` | 5 | Max runes per cast |
| `POUCH_SIZE` | 52 | Total runes in pouch (13 elements × 4) |
| `RUNES_PER_ELEMENT` | 4 | Per-element copies in pouch |
| `ELEMENT_TYPES` | 13 | air, arcane, death, earth, fire, holy, ice, lightning, poison, psy, shadow, steel, water |
| `SPELL_TIER_BASE_DAMAGE` | [0,4,8,12,16,20] | Per-tier flat base |
| `SPELL_TIER_MULT` | [0,1,2,3,4,5] | Per-tier multiplier |
| `RUNE_BASE_DAMAGE` | { common: 8, ... } | Per-rune base by rarity |

### Element Colors (`client/ui/styles.ts`)

Each element has a display color used for spell names, rune recipe borders, damage number strokes, etc. Death = crimson red (`#dc143c`), Fire = red-orange (`#ff5722`). Full map in `ELEMENT_COLORS`.

---

## Future Gameplay — Notes for Implementation

### Shop (implemented; `client/ui/ShopScreen.tsx`, `server/systems/handleBuyItem.ts`)

Between rounds the player enters the shop and can buy scrolls (per-element flat base damage) and sigils (run-wide modifiers). Both are persisted in the player state for the rest of the run. See the **Sigil System** subsection above for how sigil effects dispatch through the registries; scrolls live in `player.scrollLevels` and are applied per-rune inside `calculateSpellDamage`.

**Future sigil ideas** would typically slot into an existing registry (stat-mod / proc / hand-mult / synergy-unlock) as a single data entry. Only genuinely novel mechanics need a new category or a `SIGIL_LIFECYCLE_HOOKS` entry.

### Loose Duo Unlock Item

**Concept**: A shop item (e.g., "Grimoire of Wild Magic" or "Chaotic Fusion") that unlocks loose-duo combo spells for the rest of the run.

**What it does**: Re-enables the `COMBO_TABLE` code path in `resolveSpell.ts`. Any 2-element cast at any count split (1+1, 1+2, 2+1, 1+3, etc.) now fires a named combo spell instead of falling to single-element.

**Implementation notes**:
- The `COMBO_TABLE` content (15 loose-duo spells like Steam Burst, Hailstorm, Plasma Cannon) is already defined in `shared/spellTable.ts` and preserved.
- The resolver branch is commented out in `resolveSpell.ts` with a `NOTE:` block explaining how to re-enable it.
- To implement: since the resolver already accepts `activeSigils`, add a new `SIGIL_LOOSE_DUO` registry (or similar) in `sigilEffects.ts`, or piggyback on synergy-pair logic. Either way, gate the loose-duo branch in `resolveSpell.ts` on whether any owned sigil enables the flag.
- The `COMBINABLE_ELEMENTS` constant and `CombinableElement` type are preserved in `arkynConstants.ts` for this purpose.
- The `SpellShape = "duo"` type variant is kept in the union, and `SpellPreview.tsx` already has a `spell.shape === "duo" && " (Combo)"` display branch ready.

**Design rationale**: Without loose duos, only synergy poker shapes (Two Pair / Full House) produce combo spells. This keeps the base game simple and strategic — mismatched runes are dead weight, creating meaningful commit-vs-hold tension. The loose-duo unlock is a major power spike: it roughly doubles the playable combo space, making previously "dead" mixed hands suddenly viable.

### All-Runes-Score Item

**Concept**: A shop item that makes ALL played runes contribute to scoring, regardless of whether they match the resolved spell's contributing elements.

**What it does**: Currently, non-contributing runes (e.g., the water rune in a 3-Fire+1-Water cast → Inferno Wave Tier 3) are consumed but deal no damage. This item would make every played rune add its base damage to the Base counter, even if it doesn't match the spell's element.

**Implementation notes**: Modify `getContributingRuneIndices` in `resolveSpell.ts` to return ALL indices when the flag is set, instead of filtering by element match.

### Enemy HP Rebalancing

The current enemy HP values in `server/utils/enemyDefinitions.ts` were tuned for the old linear damage formula (`8 × tier`). The new Base + Mult curve produces significantly higher damage at all tiers (T1: 12 vs 8, T2: 48 vs 16, T5: 300 vs 40). Enemy HP needs a balancing pass once the new damage numbers feel right in playtesting.

### Spellbook Selection

Currently hardcoded to `DEFAULT_SPELLBOOK_ID = "standard"`. Future: let players choose a spellbook before the match (or purchase new ones from the shop). Each spellbook would define modifiers via fields on `SpellbookDefinition` (e.g., `handSizeModifier`, `discardModifier`, `deckSizeModifier`). The `SPELLBOOKS` registry in `shared/spellbooks.ts` and the asset loader in `client/ui/spellbookAssets.ts` are ready for expansion — just add new entries and asset folders.

### Rune Rarity Differentiation

All runes are currently `common` rarity. `RUNE_BASE_DAMAGE` is keyed by rarity (`{ common: 8, uncommon: 8, rare: 8, legendary: 8 }`) so individual rarities can be tuned without code changes. Future: higher-rarity runes drop from the shop or special events, contributing more base damage per rune.
