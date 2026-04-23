// Web Vibration API wrapper — short haptic buzzes for tap feedback.
//
// Supported on Android Chrome / Firefox / Edge. Not supported on iOS
// Safari or Chrome-on-iOS (WebKit hasn't implemented the API) — calls
// no-op silently on those platforms, so the UI layer can use `haptic()`
// everywhere without platform checks. True iOS haptics would require
// shipping as a native Capacitor/Cordova app with a Taptic Engine
// plugin; outside the scope of a pure PWA.
//
// Duration scale is tuned for subtle tap feel — Balatro-style "soft
// bump" at LIGHT, not a wrist-shaker. Keep values under 30ms; anything
// longer feels like an error alert.

const SUPPORTED = typeof navigator !== "undefined"
    && typeof (navigator as Navigator & { vibrate?: unknown }).vibrate === "function";

export const HAPTIC_LIGHT = 8;   // rune tap, menu open/close, minor UI
export const HAPTIC_MEDIUM = 15; // button press (Cast, Discard, Buy)

export function haptic(durationMs: number = HAPTIC_LIGHT): void {
    if (!SUPPORTED) return;
    try {
        navigator.vibrate(durationMs);
    } catch {
        // Some Android builds throw if called outside a user gesture —
        // swallow, we don't want a UI interaction to fail over a buzz.
    }
}
