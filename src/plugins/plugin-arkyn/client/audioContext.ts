// Shared AudioContext with an iOS-safe unlock routine.
//
// iOS Safari and Chrome-on-iOS (both are WebKit, same audio policy)
// require the AudioContext to be RESUMED from inside a user gesture
// handler; a fire-and-forget ctx.resume() called outside a gesture is
// silently ignored. When added to the home screen as a PWA the
// policy is even stricter — the classic "play a 1-sample silent
// buffer inside the first gesture" trick is needed to flush the
// platform's audio-locked bit.
//
// To guarantee audio works on mobile without sprinkling unlock logic
// through every audio-producing component, we:
//   1. Lazily create the AudioContext on first getAudioContext() call.
//   2. At that moment, install capture-phase listeners on pointer /
//      touch / click / keydown so we catch the very first gesture
//      before any React handler can stopPropagation.
//   3. Inside those listeners call ctx.resume() AND start a silent
//      1-sample buffer source — the latter is what actually unblocks
//      iOS PWA mode.
//   4. Detach the listeners once ctx.state === "running".

let ctx: AudioContext | null = null;
let unlockHandlersInstalled = false;

function installUnlockHandlers(context: AudioContext) {
    if (unlockHandlersInstalled) return;
    if (typeof window === "undefined") return;
    unlockHandlersInstalled = true;

    const tryUnlock = () => {
        if (context.state === "suspended") context.resume();
        // Silent-buffer trick — iOS (PWA mode in particular) refuses to
        // consider the audio graph "unlocked" until a real source has
        // been started inside a gesture handler. One frame of silence
        // is enough; no one hears it.
        try {
            const src = context.createBufferSource();
            src.buffer = context.createBuffer(1, 1, 22050);
            src.connect(context.destination);
            src.start(0);
        } catch { /* very old browsers may throw — ignore */ }
        // Only detach once the context has actually flipped state; on
        // slow devices the resume() Promise may take a beat, and we
        // don't want to tear down the listeners before it lands.
        if (context.state === "running") detach();
    };

    const detach = () => {
        window.removeEventListener("pointerdown", tryUnlock, true);
        window.removeEventListener("touchstart", tryUnlock, true);
        window.removeEventListener("click", tryUnlock, true);
        window.removeEventListener("keydown", tryUnlock, true);
    };

    // Capture phase so nothing up the tree can stopPropagation before
    // us. `once` is not set because the very first tap may hit while
    // resume() is still in flight — we want subsequent taps to finish
    // the unlock if needed.
    window.addEventListener("pointerdown", tryUnlock, true);
    window.addEventListener("touchstart", tryUnlock, true);
    window.addEventListener("click", tryUnlock, true);
    window.addEventListener("keydown", tryUnlock, true);
}

export function getAudioContext(): AudioContext {
    if (!ctx) {
        ctx = new AudioContext();
        installUnlockHandlers(ctx);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
}
