import type { ArkynState } from "../../../shared";
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

export function createSyncArkynStateSystem(state: ArkynState, sessionId: string) {
    let prevHandJson = "";
    let prevHandIds = new Set<string>();
    let prevPlayedJson = "";
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
    let prevPouchJson = "";
    let prevCasts = -1;
    let prevDiscards = -1;

    return () => {
        const player = state.players.get(sessionId);
        if (!player) return;

        // Sync hand
        const handData: RuneClientData[] = [];
        for (let i = 0; i < player.hand.length; i++) {
            const r = player.hand[i];
            handData.push({ id: r.id, element: r.element, rarity: r.rarity, level: r.level });
        }
        const handJson = JSON.stringify(handData);
        if (handJson !== prevHandJson) {
            // Detect runes that weren't in the previous hand (newly drawn)
            const currentIds = new Set(handData.map(r => r.id));
            const freshRunes = handData.filter(r => !prevHandIds.has(r.id));

            setHand(handData);
            clearSelectedIndices();
            prevHandJson = handJson;
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
        const playedData: RuneClientData[] = [];
        for (let i = 0; i < player.playedRunes.length; i++) {
            const r = player.playedRunes[i];
            playedData.push({ id: r.id, element: r.element, rarity: r.rarity, level: r.level });
        }
        const playedJson = JSON.stringify(playedData);
        if (playedJson !== prevPlayedJson) {
            setPlayedRunes(playedData);
            prevPlayedJson = playedJson;
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

            // Resistances and weaknesses (simple array comparison)
            const res: string[] = [];
            for (let i = 0; i < state.enemy.resistances.length; i++) {
                res.push(state.enemy.resistances[i]);
            }
            setEnemyResistances(res);

            const weak: string[] = [];
            for (let i = 0; i < state.enemy.weaknesses.length; i++) {
                weak.push(state.enemy.weaknesses[i]);
            }
            setEnemyWeaknesses(weak);
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
        const pouchData: RuneClientData[] = [];
        for (let i = 0; i < player.pouch.length; i++) {
            const r = player.pouch[i];
            pouchData.push({ id: r.id, element: r.element, rarity: r.rarity, level: r.level });
        }
        const pouchJson = JSON.stringify(pouchData);
        if (pouchJson !== prevPouchJson) {
            setPouchContents(pouchData);
            prevPouchJson = pouchJson;
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
