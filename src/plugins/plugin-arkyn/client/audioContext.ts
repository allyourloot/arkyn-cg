// Shared AudioContext — lazily initialized on first use so the browser's
// autoplay policy (which requires a user gesture before creating or
// resuming an AudioContext) is respected. Both sfx.ts and BackgroundMusic
// import from here so the entire plugin runs on a single context.

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
}
