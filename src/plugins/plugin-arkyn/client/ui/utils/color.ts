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

/**
 * Parse a `#rgb` or `#rrggbb` hex string into a [r, g, b] tuple of 0..255
 * integers. Used by `lerpColor` and any DOM-style consumer that needs the
 * `rgb(...)` form rather than the normalized triple.
 */
export function parseHex(hex: string): [number, number, number] {
    const h = hex.startsWith("#") ? hex.slice(1) : hex;
    if (h.length === 3) {
        return [
            parseInt(h[0] + h[0], 16),
            parseInt(h[1] + h[1], 16),
            parseInt(h[2] + h[2], 16),
        ];
    }
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

/**
 * Linear interpolate between two hex colors at parameter `t` (0..1) and
 * return an `rgb(r, g, b)` string suitable for an inline `color` value.
 * Used by combo-spell name gradients in BouncyText.
 */
export function lerpColor(c1: string, c2: string, t: number): string {
    const [r1, g1, b1] = parseHex(c1);
    const [r2, g2, b2] = parseHex(c2);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r}, ${g}, ${b})`;
}
