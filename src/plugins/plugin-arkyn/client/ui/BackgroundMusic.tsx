import { useEffect } from "react";
import arkynThemeUrl from "/assets/audio/music/arkyn-theme.mp3?url";

// Web Audio nodes — uses AudioBufferSourceNode so we get access to both
// playbackRate and detune AudioParams for proper pitch-shifting on game over.
let ctx: AudioContext | null = null;
let bgSource: AudioBufferSourceNode | null = null;
let bgGain: GainNode | null = null;
let bgBuffer: AudioBuffer | null = null;

function getCtx(): AudioContext {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
}

/** Start (or restart) the background music loop from the decoded buffer. */
function startLoop() {
    if (!bgBuffer || !ctx) return;
    if (bgSource) {
        try { bgSource.stop(); } catch { /* already stopped */ }
        bgSource.disconnect();
    }
    const source = ctx.createBufferSource();
    source.buffer = bgBuffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.15;
    source.connect(gain).connect(ctx.destination);
    bgSource = source;
    bgGain = gain;
    source.start();
}

const BASE_VOLUME = 0.15;
const FADE_DURATION = 0.3; // seconds for volume fade down/up

/**
 * Crossfade to new playback rate + detune: fade volume down, snap
 * pitch/speed while quiet, then fade back up. Avoids audible pitch-bend.
 */
export function setBgMusicPitch(rate: number, cents: number): void {
    if (!bgSource || !bgGain || !ctx) return;
    const now = ctx.currentTime;
    const gain = bgGain.gain;

    // Fade out
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + FADE_DURATION);

    // Snap pitch/speed at the quiet point, then fade back in
    const snapTime = now + FADE_DURATION;
    bgSource.playbackRate.setValueAtTime(rate, snapTime);
    bgSource.detune.setValueAtTime(cents, snapTime);
    gain.linearRampToValueAtTime(BASE_VOLUME, snapTime + FADE_DURATION);
}

export default function BackgroundMusic() {
    useEffect(() => {
        let cancelled = false;

        const setup = async () => {
            const audioCtx = getCtx();
            const res = await fetch(arkynThemeUrl);
            const arr = await res.arrayBuffer();
            if (cancelled) return;
            bgBuffer = await audioCtx.decodeAudioData(arr);
            if (cancelled) return;
            startLoop();
        };

        setup().catch(() => {
            // Will retry on user interaction below.
        });

        const handleInteraction = () => {
            getCtx(); // ensures context is resumed
            if (!bgSource && bgBuffer) startLoop();
            else if (!bgBuffer) setup().catch(() => {});
            window.removeEventListener("pointerdown", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
        };
        window.addEventListener("pointerdown", handleInteraction);
        window.addEventListener("keydown", handleInteraction);

        return () => {
            cancelled = true;
            window.removeEventListener("pointerdown", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
            if (bgSource) {
                try { bgSource.stop(); } catch { /* already stopped */ }
                bgSource.disconnect();
                bgSource = null;
            }
            if (bgGain) {
                bgGain.disconnect();
                bgGain = null;
            }
        };
    }, []);

    return null;
}
