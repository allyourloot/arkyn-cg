/** `true` on devices with a primary hover-capable pointer (mouse / trackpad). */
export const HAS_HOVER =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover)").matches;
