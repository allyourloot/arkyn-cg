import { ELEMENT_TYPES, type RarityType } from "./arkynConstants";
import type { TarotEffect } from "./tarots";
import { bumpRarity, clampRarityIndex, rarityIndex } from "./rarityUtils";
import { snapshotRune, type RuneSpec } from "./runeUtils";

// =============================================================================
// Tarot Effect Registry
// =============================================================================
// Each effect arm of `TarotEffect` is paired here with a `mutate` (server)
// and `preview` (client) function. The two share inputs (picker runes,
// chosen element, live pouch, RNG, id factory) and produce parallel
// outputs (`TarotMutationSet` for the server, `TarotPreviewSet` for the
// client).
//
// CRITICAL invariant: for any effect that consumes RNG (today: Wheel of
// Fortune, The World), `mutate` and `preview` MUST consume `ctx.rng`
// in the same order with the same number of calls — that's what keeps
// the picker preview byte-for-byte aligned with the server's actual
// commit. Both functions live in the same file so the loop body is
// written once and reviewed together.
//
// Adding a new tarot effect: extend the `TarotEffect` union in tarots.ts,
// then add ONE entry to `TAROT_EFFECT_HANDLERS` below. The mapped type
// `{ [K in TarotEffect["type"]]: ... }` makes a missing handler a TS
// error at compile time.
// =============================================================================

/**
 * A picker rune the player selected, paired with its index in the
 * picker's `runes[]` array. The pairing matters for the client
 * preview, which keys per-slot animations by picker index. The server
 * mutation path ignores `pickerIndex`.
 */
export interface PickedRune {
    rune: RuneSpec;
    pickerIndex: number;
}

export interface TarotEffectContext {
    /** Selected picker runes, sorted ascending by pickerIndex. */
    picked: PickedRune[];
    /** Element chosen by the player; `""` when the tarot doesn't require an element. */
    chosenElement: string;
    /**
     * The player's current pouch contents. Read by `upgradeAllOfElement`
     * (Judgement) so the effect always reflects the live pouch composition,
     * not the 8-rune picker snapshot.
     */
    livePouch: readonly RuneSpec[];
    /**
     * Pre-seeded apply-time RNG. Both `mutate` and `preview` must
     * consume this stream in the same order so the picker preview
     * matches what the server commits.
     */
    rng: () => number;
    /** Mint a fresh rune id. Server passes `nextRuneId`; client passes a string-key generator. */
    nextId: () => string;
}

export interface TarotMutationSet {
    banish: RuneSpec[];
    add: RuneSpec[];
    goldDelta: number;
}

export type SlotPreviewKind =
    | { kind: "flip"; newRune: RuneSpec }
    | { kind: "fade" }
    | { kind: "pulse" };

export interface TarotPreviewSet {
    /** Per-slot animation keyed by `PickedRune.pickerIndex`. */
    slotAnims: Map<number, SlotPreviewKind>;
    /** Runes that should materialize alongside the picker row at apply time (Lovers, World, Magician). */
    spawnedRunes: RuneSpec[];
}

export interface TarotEffectHandler<E extends TarotEffect = TarotEffect> {
    mutate(effect: E, ctx: TarotEffectContext): TarotMutationSet;
    preview(effect: E, ctx: TarotEffectContext): TarotPreviewSet;
}

// =============================================================================
// Helpers
// =============================================================================

const EMPTY_MUTATION: TarotMutationSet = { banish: [], add: [], goldDelta: 0 };
const EMPTY_PREVIEW: TarotPreviewSet = { slotAnims: new Map(), spawnedRunes: [] };

function buildAdd(ctx: TarotEffectContext, fields: Omit<RuneSpec, "id">): RuneSpec {
    return { id: ctx.nextId(), ...fields };
}

function fadePreview(ctx: TarotEffectContext): TarotPreviewSet {
    const slotAnims = new Map<number, SlotPreviewKind>();
    for (const p of ctx.picked) slotAnims.set(p.pickerIndex, { kind: "fade" });
    return { slotAnims, spawnedRunes: [] };
}

// =============================================================================
// Effect handlers
// =============================================================================

const convertElement: TarotEffectHandler<Extract<TarotEffect, { type: "convertElement" }>> = {
    mutate(effect, ctx) {
        const banish: RuneSpec[] = [];
        const add: RuneSpec[] = [];
        for (const { rune } of ctx.picked) {
            banish.push(snapshotRune(rune));
            add.push(buildAdd(ctx, { element: effect.element, rarity: rune.rarity, level: rune.level }));
        }
        return { banish, add, goldDelta: 0 };
    },
    preview(effect, ctx) {
        const slotAnims = new Map<number, SlotPreviewKind>();
        for (const { rune, pickerIndex } of ctx.picked) {
            slotAnims.set(pickerIndex, {
                kind: "flip",
                newRune: { ...rune, element: effect.element },
            });
        }
        return { slotAnims, spawnedRunes: [] };
    },
};

const duplicate: TarotEffectHandler<Extract<TarotEffect, { type: "duplicate" }>> = {
    mutate(_effect, ctx) {
        const add: RuneSpec[] = [];
        for (const { rune } of ctx.picked) {
            add.push(buildAdd(ctx, { element: rune.element, rarity: rune.rarity, level: rune.level }));
        }
        return { banish: [], add, goldDelta: 0 };
    },
    preview(_effect, ctx) {
        // Originals pulse in place; copies materialize as spawned runes
        // appended to the right of the picker row.
        const slotAnims = new Map<number, SlotPreviewKind>();
        const spawnedRunes: RuneSpec[] = [];
        for (const { rune, pickerIndex } of ctx.picked) {
            slotAnims.set(pickerIndex, { kind: "pulse" });
            spawnedRunes.push({ id: ctx.nextId(), element: rune.element, rarity: rune.rarity, level: rune.level });
        }
        return { slotAnims, spawnedRunes };
    },
};

const upgradeRarity: TarotEffectHandler<Extract<TarotEffect, { type: "upgradeRarity" }>> = {
    mutate(effect, ctx) {
        const banish: RuneSpec[] = [];
        const add: RuneSpec[] = [];
        for (const { rune } of ctx.picked) {
            banish.push(snapshotRune(rune));
            add.push(buildAdd(ctx, {
                element: rune.element,
                rarity: bumpRarity(rune.rarity, effect.tiersUp),
                level: rune.level,
            }));
        }
        return { banish, add, goldDelta: 0 };
    },
    preview(effect, ctx) {
        const slotAnims = new Map<number, SlotPreviewKind>();
        for (const { rune, pickerIndex } of ctx.picked) {
            slotAnims.set(pickerIndex, {
                kind: "flip",
                newRune: { ...rune, rarity: bumpRarity(rune.rarity, effect.tiersUp) },
            });
        }
        return { slotAnims, spawnedRunes: [] };
    },
};

const consecrate: TarotEffectHandler<Extract<TarotEffect, { type: "consecrate" }>> = {
    mutate(_effect, ctx) {
        const banish: RuneSpec[] = [];
        const add: RuneSpec[] = [];
        for (const { rune } of ctx.picked) {
            banish.push(snapshotRune(rune));
            add.push(buildAdd(ctx, {
                element: ctx.chosenElement,
                rarity: bumpRarity(rune.rarity, 1),
                level: rune.level,
            }));
        }
        return { banish, add, goldDelta: 0 };
    },
    preview(_effect, ctx) {
        if (!ctx.chosenElement) return EMPTY_PREVIEW;
        const slotAnims = new Map<number, SlotPreviewKind>();
        for (const { rune, pickerIndex } of ctx.picked) {
            slotAnims.set(pickerIndex, {
                kind: "flip",
                newRune: { ...rune, element: ctx.chosenElement, rarity: bumpRarity(rune.rarity, 1) },
            });
        }
        return { slotAnims, spawnedRunes: [] };
    },
};

const fuse: TarotEffectHandler<Extract<TarotEffect, { type: "fuse" }>> = {
    mutate(_effect, ctx) {
        if (ctx.picked.length !== 2) return EMPTY_MUTATION;
        const [a, b] = ctx.picked;
        const fusedRarity: RarityType = clampRarityIndex(
            Math.max(rarityIndex(a.rune.rarity), rarityIndex(b.rune.rarity)) + 1,
        );
        return {
            banish: [snapshotRune(a.rune), snapshotRune(b.rune)],
            add: [buildAdd(ctx, { element: ctx.chosenElement, rarity: fusedRarity, level: 1 })],
            goldDelta: 0,
        };
    },
    preview(_effect, ctx) {
        // Always fade both picks (matches the pre-registry behavior in
        // computeSlotAnims). The spawn rune materializes only once the
        // count-of-2 + chosen element invariants are both satisfied.
        const { slotAnims } = fadePreview(ctx);
        if (ctx.picked.length !== 2 || !ctx.chosenElement) {
            return { slotAnims, spawnedRunes: [] };
        }
        const [a, b] = ctx.picked;
        const fusedRarity = clampRarityIndex(
            Math.max(rarityIndex(a.rune.rarity), rarityIndex(b.rune.rarity)) + 1,
        );
        return {
            slotAnims,
            spawnedRunes: [{
                id: ctx.nextId(),
                element: ctx.chosenElement,
                rarity: fusedRarity,
                level: 1,
            }],
        };
    },
};

const wheelReroll: TarotEffectHandler<Extract<TarotEffect, { type: "wheelReroll" }>> = {
    // Per-rune RNG: 50% upgrade rarity, otherwise random different element.
    // Server and client walk picked in the SAME order with the SAME rng,
    // so the preview reveals exactly the rune the server will commit.
    mutate(_effect, ctx) {
        const banish: RuneSpec[] = [];
        const add: RuneSpec[] = [];
        for (const { rune } of ctx.picked) {
            banish.push(snapshotRune(rune));
            const result = rollWheel(rune, ctx.rng);
            add.push(buildAdd(ctx, result));
        }
        return { banish, add, goldDelta: 0 };
    },
    preview(_effect, ctx) {
        const slotAnims = new Map<number, SlotPreviewKind>();
        for (const { rune, pickerIndex } of ctx.picked) {
            const result = rollWheel(rune, ctx.rng);
            slotAnims.set(pickerIndex, {
                kind: "flip",
                newRune: { id: `wheel-${pickerIndex}`, ...result },
            });
        }
        return { slotAnims, spawnedRunes: [] };
    },
};

function rollWheel(rune: RuneSpec, rng: () => number): Omit<RuneSpec, "id"> {
    if (rng() < 0.5) {
        return { element: rune.element, rarity: bumpRarity(rune.rarity, 1), level: rune.level };
    }
    const others = ELEMENT_TYPES.filter(e => e !== rune.element);
    const newEl = others[Math.floor(rng() * others.length)];
    return { element: newEl, rarity: rune.rarity as RarityType, level: rune.level };
}

const banishHandler: TarotEffectHandler<Extract<TarotEffect, { type: "banish" }>> = {
    mutate(_effect, ctx) {
        return {
            banish: ctx.picked.map(p => snapshotRune(p.rune)),
            add: [],
            goldDelta: 0,
        };
    },
    preview(_effect, ctx) {
        return fadePreview(ctx);
    },
};

const banishForGold: TarotEffectHandler<Extract<TarotEffect, { type: "banishForGold" }>> = {
    mutate(effect, ctx) {
        return {
            banish: ctx.picked.map(p => snapshotRune(p.rune)),
            add: [],
            goldDelta: ctx.picked.length * effect.goldPerRune,
        };
    },
    preview(_effect, ctx) {
        return fadePreview(ctx);
    },
};

const upgradeAllOfElement: TarotEffectHandler<Extract<TarotEffect, { type: "upgradeAllOfElement" }>> = {
    // Walks the LIVE pouch (not the picker snapshot) so the effect
    // always reflects current pouch composition — matters when an
    // earlier tarot in the same shop visit added/changed runes.
    mutate(_effect, ctx) {
        const banish: RuneSpec[] = [];
        const add: RuneSpec[] = [];
        for (const r of ctx.livePouch) {
            if (r.element !== ctx.chosenElement) continue;
            banish.push(snapshotRune(r));
            add.push(buildAdd(ctx, {
                element: r.element,
                rarity: bumpRarity(r.rarity, 1),
                level: r.level,
            }));
        }
        return { banish, add, goldDelta: 0 };
    },
    preview() {
        // No picker animation — Judgement has no picker runes; the
        // visual feedback is the pouch counter + Pouch Modal updating
        // after the apply message commits.
        return EMPTY_PREVIEW;
    },
};

const addRandomRune: TarotEffectHandler<Extract<TarotEffect, { type: "addRandomRune" }>> = {
    // Two rng() calls in this order: element pick, then rarity roll.
    // mutate and preview MUST stay in this exact order or the preview
    // diverges from the server commit.
    mutate(effect, ctx) {
        const spec = rollWorld(effect.legendaryChance, ctx.rng);
        return { banish: [], add: [buildAdd(ctx, spec)], goldDelta: 0 };
    },
    preview(effect, ctx) {
        const spec = rollWorld(effect.legendaryChance, ctx.rng);
        return {
            slotAnims: new Map(),
            spawnedRunes: [{ id: ctx.nextId(), ...spec }],
        };
    },
};

function rollWorld(legendaryChance: number, rng: () => number): Omit<RuneSpec, "id"> {
    const element = ELEMENT_TYPES[Math.floor(rng() * ELEMENT_TYPES.length)];
    const rarity: RarityType = rng() < legendaryChance ? "legendary" : "rare";
    return { element, rarity, level: 1 };
}

// =============================================================================
// Registry
// =============================================================================

export const TAROT_EFFECT_HANDLERS: {
    [K in TarotEffect["type"]]: TarotEffectHandler<Extract<TarotEffect, { type: K }>>;
} = {
    convertElement,
    duplicate,
    upgradeRarity,
    consecrate,
    fuse,
    wheelReroll,
    banish: banishHandler,
    banishForGold,
    upgradeAllOfElement,
    addRandomRune,
};

/**
 * Generic dispatch — runs the registry's `mutate` for `effect.type`.
 * Casts via `as never` because the mapped-type lookup gives us a union
 * of handler shapes, but at runtime the lookup is type-safe.
 */
export function applyTarotMutation(effect: TarotEffect, ctx: TarotEffectContext): TarotMutationSet {
    return TAROT_EFFECT_HANDLERS[effect.type].mutate(effect as never, ctx);
}

/**
 * Generic dispatch — runs the registry's `preview` for `effect.type`.
 * Same casting rationale as `applyTarotMutation`.
 */
export function previewTarotEffect(effect: TarotEffect, ctx: TarotEffectContext): TarotPreviewSet {
    return TAROT_EFFECT_HANDLERS[effect.type].preview(effect as never, ctx);
}
