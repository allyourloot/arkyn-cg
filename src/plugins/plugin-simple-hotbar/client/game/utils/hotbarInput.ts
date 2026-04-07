export function getHotbarSlotFromKeyboardEvent(event: KeyboardEvent): number | null {
    const codeMatch = event.code.match(/^(?:Digit|Numpad)([1-9])$/);
    if (!codeMatch) return null;
    return Number(codeMatch[1]) - 1;
}
