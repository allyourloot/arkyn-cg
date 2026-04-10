// Shared motion constants for the rune card lift on select / deselect.
// Tuned for snappy "Balatro-style" feel — back-out overshoot on the lift,
// fast power-out on the drop. Tweak these and the whole hand inherits.

/** Pixels the card translates upward when selected. */
export const SELECT_LIFT_PX = -16;
/** Scale factor at the peak of the select tween (slight squash). */
export const SELECT_SCALE = 1.04;
/**
 * Tiny rotation jitter ADDED to the card's existing fan rotation when
 * selected. Reads as a small "tilt of attention" instead of a stiff lift.
 */
export const SELECT_JITTER_DEG = 1.5;
/** Easing for the select-lift tween. */
export const SELECT_EASE = "back.out(1.9)";
/** Duration of the select-lift tween in seconds. */
export const SELECT_DURATION_S = 0.22;

/** Easing for the deselect-drop tween. */
export const DESELECT_EASE = "power3.out";
/** Duration of the deselect-drop tween in seconds. */
export const DESELECT_DURATION_S = 0.16;
