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
    clearSelectedIndices,
    triggerDrawAnimation,
    getHandIndex,
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

    return () => {
        const player = state.players.get(sessionId);
        if (!player) return;

        // Sync hand — only allocate when ids actually changed.
        if (!runeArraysEqualById(player.hand, prevHand)) {
            const handData = snapshotRunes(player.hand);
            const currentIds = new Set(handData.map(r => r.id));
            const freshRunes = handData.filter(r => !prevHandIds.has(r.id));

            setHand(handData);
            clearSelectedIndices();
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
    };
}
