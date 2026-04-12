import type { ArraySchema } from "@colyseus/schema";
import type { ArkynState, RuneInstance } from "../../../shared";
import {
    setHand,
    setPlayedRunes,
    setEnemyName,
    setEnemyHp,
    setEnemyMaxHp,
    setEnemyElement,
    setEnemyResistances,
    setEnemyWeaknesses,
    setGamePhase,
    setLastSpellName,
    setLastSpellTier,
    setLastDamage,
    setCurrentRound,
    setPouchSize,
    setPouchContents,
    setCastsRemaining,
    setDiscardsRemaining,
    setGold,
    setLastRoundGoldBase,
    setLastRoundGoldHandsBonus,
    setLastRoundGoldHandsCount,
    setRunTotalDamage,
    setRunTotalCasts,
    setRunTotalDiscards,
    setRunHighestSingleCast,
    setRunFavoriteSpell,
    setRunEnemiesDefeated,
    setRunGoldEarned,
    setBestRound,
    setBestSingleCast,
    clearSelectedIndices,
    triggerDrawAnimation,
    getHandIndex,
    getIsCastAnimating,
    clearCastingRuneIds,
    clearLastCastState,
    type RuneClientData,
} from "../../arkynStore";

function runeFromSchema(r: RuneInstance): RuneClientData {
    return { id: r.id, element: r.element, rarity: r.rarity, level: r.level };
}

/**
 * Allocation-free identity check between a Schema rune array and the last
 * snapshot we sent to the store. Rune ids are server-assigned and unique
 * (createPouch.ts), and rune fields don't mutate after construction, so
 * matching length + matching ids in order is enough to know the array is
 * unchanged. The common case (no change) returns without allocating.
 */
function runeArraysEqualById(
    schemaArr: ArraySchema<RuneInstance>,
    prev: RuneClientData[],
): boolean {
    if (schemaArr.length !== prev.length) return false;
    for (let i = 0; i < schemaArr.length; i++) {
        if (schemaArr[i].id !== prev[i].id) return false;
    }
    return true;
}

function stringArraysEqual(
    schemaArr: ArraySchema<string>,
    prev: string[],
): boolean {
    if (schemaArr.length !== prev.length) return false;
    for (let i = 0; i < schemaArr.length; i++) {
        if (schemaArr[i] !== prev[i]) return false;
    }
    return true;
}

function snapshotRunes(schemaArr: ArraySchema<RuneInstance>): RuneClientData[] {
    const out: RuneClientData[] = new Array(schemaArr.length);
    for (let i = 0; i < schemaArr.length; i++) {
        out[i] = runeFromSchema(schemaArr[i]);
    }
    return out;
}

export function createSyncArkynStateSystem(state: ArkynState, sessionId: string) {
    let prevHand: RuneClientData[] = [];
    let prevHandIds = new Set<string>();
    let prevPlayed: RuneClientData[] = [];
    let prevPouch: RuneClientData[] = [];
    let prevRes: string[] = [];
    let prevWeak: string[] = [];
    let prevPhase = "";
    let prevEnemyHp = -1;
    let prevEnemyMaxHp = -1;
    let prevEnemyName = "";
    let prevEnemyElement = "";
    let prevSpellName = "";
    let prevSpellTier = -1;
    let prevDamage = -1;
    let prevRound = -1;
    let prevPouchSize = -1;
    let prevCasts = -1;
    let prevDiscards = -1;
    let prevGold = -1;
    let prevGoldBase = -1;
    let prevGoldHandsBonus = -1;
    let prevGoldHandsCount = -1;
    let prevRunTotalDamage = -1;
    let prevRunTotalCasts = -1;
    let prevRunTotalDiscards = -1;
    let prevRunHighestSingleCast = -1;
    let prevRunFavoriteSpell = "";
    let prevRunEnemiesDefeated = -1;
    let prevRunGoldEarned = -1;
    let prevBestRound = -1;
    let prevBestSingleCast = -1;

    return () => {
        const player = state.players.get(sessionId);
        if (!player) return;

        // Sync hand — only allocate when ids actually changed.
        //
        // Defer hand updates while a cast is animating so the new runes don't
        // pop in (and the draw animation doesn't fire) until the played
        // sequence has fully resolved. The server response arrives mid-cast
        // and would otherwise overlap the dissolve. Skipping the block here
        // is safe because `prevHand` is left untouched, so the next tick
        // after `isCastAnimating` clears will detect the change and run the
        // full sync + draw animation in a single pass.
        //
        // Also defer for the entire `round_end` phase. On a winning cast the
        // server removes the 5 played runes but never refills (handleCast
        // returns early on the killing blow), so the hand state shrinks from
        // 8 → 3. Applying that update would visibly collapse the hand
        // container behind the round-end overlay's translucent backdrop:
        // the 3 survivors snap to center and the spellbook (anchored at
        // .handAnchor's right edge in PouchCounter.module.css) jumps left.
        // Holding the old hand layout — castingRuneIds keeps the 5 played
        // slots hidden because clearCastingRuneIds is also inside this
        // block — keeps the UI rock-solid until handleReady starts the next
        // round and gamePhase leaves "round_end".
        if (
            !getIsCastAnimating() &&
            state.gamePhase !== "round_end" &&
            !runeArraysEqualById(player.hand, prevHand)
        ) {
            const handData = snapshotRunes(player.hand);
            const currentIds = new Set(handData.map(r => r.id));
            const freshRunes = handData.filter(r => !prevHandIds.has(r.id));

            setHand(handData);
            clearSelectedIndices();
            // Clear `castingRuneIds` in the same synchronous batch as
            // `setHand` so HandDisplay's useGSAP (useLayoutEffect) snaps the
            // remaining cards' slid-left transforms to x=0 in lockstep with
            // the new flex layout — no flicker between the cast slide and
            // the new natural positions of the persisted slot DOM nodes.
            clearCastingRuneIds();
            prevHand = handData;
            prevHandIds = currentIds;

            // Trigger draw animation (skip initial draw). Look up display
            // indices AFTER setHand so animations land in the right slots.
            if (freshRunes.length > 0 && freshRunes.length < handData.length) {
                const draws: { rune: RuneClientData; handIndex: number }[] = [];
                for (const r of freshRunes) {
                    const handIndex = getHandIndex(r.id);
                    if (handIndex >= 0) draws.push({ rune: r, handIndex });
                }
                if (draws.length > 0) triggerDrawAnimation(draws);
            }
        }

        // Sync played runes
        if (!runeArraysEqualById(player.playedRunes, prevPlayed)) {
            prevPlayed = snapshotRunes(player.playedRunes);
            setPlayedRunes(prevPlayed);
        }

        // Sync game phase
        if (state.gamePhase !== prevPhase) {
            // New run: game_over → playing. Clear stale cast state so the
            // Spell Preview doesn't show the previous game's last cast.
            if (state.gamePhase === "playing" && prevPhase === "game_over") {
                clearLastCastState();
            }
            setGamePhase(state.gamePhase);
            prevPhase = state.gamePhase;
        }

        // Sync enemy
        if (state.enemy) {
            if (state.enemy.currentHp !== prevEnemyHp) {
                setEnemyHp(state.enemy.currentHp);
                prevEnemyHp = state.enemy.currentHp;
            }
            if (state.enemy.maxHp !== prevEnemyMaxHp) {
                setEnemyMaxHp(state.enemy.maxHp);
                prevEnemyMaxHp = state.enemy.maxHp;
            }
            if (state.enemy.name !== prevEnemyName) {
                setEnemyName(state.enemy.name);
                prevEnemyName = state.enemy.name;
            }
            if (state.enemy.element !== prevEnemyElement) {
                setEnemyElement(state.enemy.element);
                prevEnemyElement = state.enemy.element;
            }

            // Resistances / weaknesses — gated so the setters (and the
            // notify they trigger) don't fire on every tick.
            if (!stringArraysEqual(state.enemy.resistances, prevRes)) {
                prevRes = Array.from(state.enemy.resistances);
                setEnemyResistances(prevRes);
            }
            if (!stringArraysEqual(state.enemy.weaknesses, prevWeak)) {
                prevWeak = Array.from(state.enemy.weaknesses);
                setEnemyWeaknesses(prevWeak);
            }
        }

        // Sync spell info
        if (player.lastSpellName !== prevSpellName) {
            setLastSpellName(player.lastSpellName);
            prevSpellName = player.lastSpellName;
        }
        if (player.lastSpellTier !== prevSpellTier) {
            setLastSpellTier(player.lastSpellTier);
            prevSpellTier = player.lastSpellTier;
        }
        if (player.lastDamage !== prevDamage) {
            setLastDamage(player.lastDamage);
            prevDamage = player.lastDamage;
        }

        // Sync round and pouch
        if (state.currentRound !== prevRound) {
            // On round transitions after the initial sync, wipe the
            // Spell Preview's "Last Cast" state so the panel doesn't
            // keep showing the previous round's final cast once the
            // player leaves the shop.
            if (prevRound >= 1) {
                clearLastCastState();
            }
            setCurrentRound(state.currentRound);
            prevRound = state.currentRound;
        }
        if (player.pouchSize !== prevPouchSize) {
            setPouchSize(player.pouchSize);
            prevPouchSize = player.pouchSize;
        }

        // Sync pouch contents (used by the pouch modal)
        if (!runeArraysEqualById(player.pouch, prevPouch)) {
            prevPouch = snapshotRunes(player.pouch);
            setPouchContents(prevPouch);
        }
        if (player.castsRemaining !== prevCasts) {
            setCastsRemaining(player.castsRemaining);
            prevCasts = player.castsRemaining;
        }
        if (player.discardsRemaining !== prevDiscards) {
            setDiscardsRemaining(player.discardsRemaining);
            prevDiscards = player.discardsRemaining;
        }

        // Sync currency
        if (player.gold !== prevGold) {
            setGold(player.gold);
            prevGold = player.gold;
        }
        if (player.lastRoundGoldBase !== prevGoldBase) {
            setLastRoundGoldBase(player.lastRoundGoldBase);
            prevGoldBase = player.lastRoundGoldBase;
        }
        if (player.lastRoundGoldHandsBonus !== prevGoldHandsBonus) {
            setLastRoundGoldHandsBonus(player.lastRoundGoldHandsBonus);
            prevGoldHandsBonus = player.lastRoundGoldHandsBonus;
        }
        if (player.lastRoundGoldHandsCount !== prevGoldHandsCount) {
            setLastRoundGoldHandsCount(player.lastRoundGoldHandsCount);
            prevGoldHandsCount = player.lastRoundGoldHandsCount;
        }

        // Sync run stats
        if (player.runTotalDamage !== prevRunTotalDamage) {
            setRunTotalDamage(player.runTotalDamage);
            prevRunTotalDamage = player.runTotalDamage;
        }
        if (player.runTotalCasts !== prevRunTotalCasts) {
            setRunTotalCasts(player.runTotalCasts);
            prevRunTotalCasts = player.runTotalCasts;
        }
        if (player.runTotalDiscards !== prevRunTotalDiscards) {
            setRunTotalDiscards(player.runTotalDiscards);
            prevRunTotalDiscards = player.runTotalDiscards;
        }
        if (player.runHighestSingleCast !== prevRunHighestSingleCast) {
            setRunHighestSingleCast(player.runHighestSingleCast);
            prevRunHighestSingleCast = player.runHighestSingleCast;
        }
        if (player.runFavoriteSpell !== prevRunFavoriteSpell) {
            setRunFavoriteSpell(player.runFavoriteSpell);
            prevRunFavoriteSpell = player.runFavoriteSpell;
        }
        if (player.runEnemiesDefeated !== prevRunEnemiesDefeated) {
            setRunEnemiesDefeated(player.runEnemiesDefeated);
            prevRunEnemiesDefeated = player.runEnemiesDefeated;
        }
        if (player.runGoldEarned !== prevRunGoldEarned) {
            setRunGoldEarned(player.runGoldEarned);
            prevRunGoldEarned = player.runGoldEarned;
        }

        // Sync personal bests
        if (player.bestRound !== prevBestRound) {
            setBestRound(player.bestRound);
            prevBestRound = player.bestRound;
        }
        if (player.bestSingleCast !== prevBestSingleCast) {
            setBestSingleCast(player.bestSingleCast);
            prevBestSingleCast = player.bestSingleCast;
        }
    };
}
