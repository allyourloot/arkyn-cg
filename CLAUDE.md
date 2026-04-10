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
finalDamage = baseTotal × SPELL_TIER_MULT[tier]
```

- `SPELL_TIER_BASE_DAMAGE = [0, 4, 8, 12, 16, 20]` — flat per-tier base.
- `SPELL_TIER_MULT = [0, 1, 2, 3, 4, 5]` — flat per-tier multiplier.
- `RUNE_BASE_DAMAGE = { common: 8, uncommon: 8, rare: 8, legendary: 8 }` — per-rune contribution by rarity (all 8 today; tunable per-rarity later).
- Per-rune `resistMod`: ×1.5 if enemy is weak to that rune's element, ×0.5 if resistant, ×1.0 neutral.
- `calculateSpellDamage(spell, runes, rarities, resistances, weaknesses)` returns the full `SpellDamageBreakdown` (spellBase, runeBaseContributions, baseTotal, mult, finalDamage, per-rune crit/resist flags).
- Server calls `calculateDamage(...)` (returns just `finalDamage`) from `handleCast.ts`.

### Cast Animation Pipeline (client)

1. `castSpell()` in `arkynAnimations.ts` calls `calculateSpellDamage` client-side (same shared formula → identical numbers).
2. Builds per-rune `runeBreakdown[]` and passes it + `spellBaseDamage` + `totalDamage` to `buildCastTimeline()`.
3. The GSAP timeline orchestrates: fly runes to play area → settle → raise contributing slots → per-rune damage bubbles pop (staggered) while the Base counter ticks in the Spell Preview → dissolve shader tears runes apart → total damage count-up reveal (0.5s GSAP tween) → enemy floating damage number + HP bar shake → cleanup.
4. Key store fields: `castBaseCounter` (live Base tick), `castTotalDamage` (live Total count-up, sentinel `-1` until reveal), `lastCastBaseDamage` (snapshot for Last Cast view).

### Spell Preview Panel (`client/ui/SpellPreview.tsx`)

Left-side panel showing:
- **Round info** (orange inner-frame chip, top)
- **Heading** ("Spell Preview" / "Casting" / "Last Cast")
- **Spell info section** (rune recipe tiles via `RuneImage`, spell name with per-element color or per-char gradient for combos via `BouncyText.colorRange`, tier, description)
- **Damage chips** (Base blue / Mult green / Total red, side-by-side row + total below):
  - Live preview: Base = spell tier base only, Mult = tier mult, Total = "-"
  - Casting: Base ticks from spellBase → baseTotal, Mult static, Total reveals via count-up after all rune ticks
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

### Shop System

Between rounds (or at specific intervals), players will be able to spend gold on items that modify their run. Items persist for the duration of the run and provide passive modifiers.

**Example item categories:**
- **Spellbook modifiers**: +1 hand size, -1 discard, +deck size, etc. Implemented via `SpellbookDefinition` fields once spellbooks are selectable.
- **Damage modifiers**: +X base damage per rune, +X mult per crit, flat damage bonuses, etc.
- **Rune manipulation**: draw runes of your most-common element first, peek at the top of the pouch, etc.
- **Special unlocks**: items that enable new mechanics (see below).

### Loose Duo Unlock Item

**Concept**: A shop item (e.g., "Grimoire of Wild Magic" or "Chaotic Fusion") that unlocks loose-duo combo spells for the rest of the run.

**What it does**: Re-enables the `COMBO_TABLE` code path in `resolveSpell.ts`. Any 2-element cast at any count split (1+1, 1+2, 2+1, 1+3, etc.) now fires a named combo spell instead of falling to single-element.

**Implementation notes**:
- The `COMBO_TABLE` content (15 loose-duo spells like Steam Burst, Hailstorm, Plasma Cannon) is already defined in `shared/spellTable.ts` and preserved.
- The resolver branch is commented out in `resolveSpell.ts` with a `NOTE:` block explaining how to re-enable it.
- To implement: add a boolean flag to the player/runtime state (e.g., `looseDuosEnabled`), pass it to `resolveSpell`, and gate the loose-duo branch on it.
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
