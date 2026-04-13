/** Convert a hex color string (e.g. "#ff5722") to a normalized [r, g, b] triple (0..1). */
export function hexToRgbTriple(hex: string): [number, number, number] {
    const cleaned = hex.replace(/^#/, "");
    const num = parseInt(cleaned, 16);
    return [
        ((num >> 16) & 0xff) / 255,
        ((num >> 8) & 0xff) / 255,
        (num & 0xff) / 255,
    ];
}
