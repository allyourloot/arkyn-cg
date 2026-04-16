// Monotonic rune id generator shared by `createPouch` (fills the base
// pouch each round) and `rollBagRunes` (generates Rune Bag rolls). One
// counter avoids id collisions when the same process builds a round's
// pouch AND rolls a bag in the same tick.
let runeIdCounter = 0;

export function nextRuneId(): string {
    return `rune-${++runeIdCounter}`;
}
