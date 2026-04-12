import { useEffect } from "react";
import arkynThemeUrl from "/assets/audio/music/arkyn-theme.ogg?url";
import shopThemeUrl from "/assets/audio/music/shop.ogg?url";
import bossThemeUrl from "/assets/audio/music/boss.ogg?url";
import { useGamePhase, useEnemyIsBoss } from "../arkynStore";
import { getAudioContext } from "../audioContext";

/**
 * Background music manager.
 *
 * Owns two looping music tracks (the main Arkyn theme and the shop
 * theme) as module-level singletons so playback is never interrupted
 * when ArkynOverlay switches between its phase-branch returns and
 * remounts the component. The React component is just a thin driver
 * that loads the buffers once, kicks the first track, and crossfades
 * to the appropriate track whenever `gamePhase` changes.
 */

type TrackKey = "theme" | "shop" | "boss";

// Shared with sfx.ts via audioContext.ts. Nodes live beyond component
// lifecycles — we deliberately do NOT stop sources on unmount.
let themeBuffer: AudioBuffer | null = null;
let shopBuffer: AudioBuffer | null = null;
let bossBuffer: AudioBuffer | null = null;

// The currently-audible track. `activeSource` / `activeGain` point at
// whichever track's gain is at (or ramping toward) BASE_VOLUME; a
// separate outgoing source/gain may still exist briefly during a
// crossfade but will be stopped + disconnected when its fade-out
// timeout fires.
let activeSource: AudioBufferSourceNode | null = null;
let activeGain: GainNode | null = null;
let activeTrack: TrackKey | null = null;

const BASE_VOLUME = 0.25;
const PITCH_FADE_DURATION = 0.3; // seconds for pitch-shift fade down/up
const CROSSFADE_DURATION = 1.0;  // seconds for track-switch crossfade

/** Lazy-load and decode both music buffers. Idempotent. */
async function loadBuffers(): Promise<void> {
    const ctx = getAudioContext();
    if (!themeBuffer) {
        const res = await fetch(arkynThemeUrl);
        const arr = await res.arrayBuffer();
        themeBuffer = await ctx.decodeAudioData(arr);
    }
    if (!shopBuffer) {
        const res = await fetch(shopThemeUrl);
        const arr = await res.arrayBuffer();
        shopBuffer = await ctx.decodeAudioData(arr);
    }
    if (!bossBuffer) {
        const res = await fetch(bossThemeUrl);
        const arr = await res.arrayBuffer();
        bossBuffer = await ctx.decodeAudioData(arr);
    }
}

function getBuffer(key: TrackKey): AudioBuffer | null {
    if (key === "shop") return shopBuffer;
    if (key === "boss") return bossBuffer;
    return themeBuffer;
}

/** Start a track immediately at BASE_VOLUME. Used for the first play. */
function startTrack(key: TrackKey): void {
    const buf = getBuffer(key);
    if (!buf) return;
    const ctx = getAudioContext();

    if (activeSource) {
        try { activeSource.stop(); } catch { /* already stopped */ }
        activeSource.disconnect();
    }
    if (activeGain) {
        activeGain.disconnect();
    }

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = BASE_VOLUME;
    source.connect(gain).connect(ctx.destination);

    activeSource = source;
    activeGain = gain;
    activeTrack = key;
    source.start();
}

/**
 * Crossfade from the currently-playing track to `key` over
 * CROSSFADE_DURATION seconds. Starts the incoming source at gain 0,
 * ramps it up while ramping the outgoing source down, then stops the
 * old source cleanly once the fade finishes.
 *
 * If nothing is currently playing the incoming track just starts at
 * BASE_VOLUME (no fade-in needed — there's nothing to fade over).
 */
export function crossfadeToTrack(key: TrackKey): void {
    if (activeTrack === key && activeSource) return;
    const buf = getBuffer(key);
    if (!buf) return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (!activeSource || !activeGain) {
        startTrack(key);
        return;
    }

    // Spin up the incoming track at 0 volume and ramp up.
    const incomingSource = ctx.createBufferSource();
    incomingSource.buffer = buf;
    incomingSource.loop = true;
    const incomingGain = ctx.createGain();
    incomingGain.gain.setValueAtTime(0, now);
    incomingSource.connect(incomingGain).connect(ctx.destination);
    incomingSource.start();
    incomingGain.gain.linearRampToValueAtTime(BASE_VOLUME, now + CROSSFADE_DURATION);

    // Ramp the outgoing track down and stop it cleanly after the fade.
    const outgoingSource = activeSource;
    const outgoingGain = activeGain;
    outgoingGain.gain.cancelScheduledValues(now);
    outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, now);
    outgoingGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION);
    window.setTimeout(() => {
        try { outgoingSource.stop(); } catch { /* already stopped */ }
        outgoingSource.disconnect();
        outgoingGain.disconnect();
    }, CROSSFADE_DURATION * 1000 + 50);

    activeSource = incomingSource;
    activeGain = incomingGain;
    activeTrack = key;
}

/**
 * Crossfade to new playback rate + detune: fade volume down, snap
 * pitch/speed while quiet, then fade back up. Avoids audible pitch-bend.
 * Applies to whichever track is currently active.
 */
export function setBgMusicPitch(rate: number, cents: number): void {
    if (!activeSource || !activeGain) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const gain = activeGain.gain;

    // Fade out
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + PITCH_FADE_DURATION);

    // Snap pitch/speed at the quiet point, then fade back in
    const snapTime = now + PITCH_FADE_DURATION;
    activeSource.playbackRate.setValueAtTime(rate, snapTime);
    activeSource.detune.setValueAtTime(cents, snapTime);
    gain.linearRampToValueAtTime(BASE_VOLUME, snapTime + PITCH_FADE_DURATION);
}

function pickTrack(gamePhase: string, isBoss: boolean): TrackKey {
    if (gamePhase === "shop") return "shop";
    if (isBoss && (gamePhase === "playing" || gamePhase === "round_end" || gamePhase === "game_over")) return "boss";
    return "theme";
}

export default function BackgroundMusic() {
    const gamePhase = useGamePhase();
    const isBoss = useEnemyIsBoss();

    // One-time setup: decode both tracks and start whichever one is
    // currently appropriate. Deliberately does NOT stop audio on
    // unmount — ArkynOverlay swaps the component between phase
    // branches and we want the music to play uninterrupted across
    // those remounts. The module-level singletons above outlive the
    // React component lifecycle.
    useEffect(() => {
        let cancelled = false;

        const setup = async () => {
            try {
                await loadBuffers();
                if (cancelled) return;
                if (!activeSource) {
                    startTrack(pickTrack(gamePhase, isBoss));
                }
            } catch { /* will retry on interaction */ }
        };
        setup();

        // Browsers block audio until the first user gesture. If the
        // initial setup didn't manage to start the track (autoplay
        // blocked) the first click/key will kick it.
        const handleInteraction = () => {
            getAudioContext();
            if (!activeSource) {
                loadBuffers()
                    .then(() => {
                        if (!activeSource) {
                            startTrack(pickTrack(gamePhase, isBoss));
                        }
                    })
                    .catch(() => { /* noop */ });
            }
            window.removeEventListener("pointerdown", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
        };
        window.addEventListener("pointerdown", handleInteraction);
        window.addEventListener("keydown", handleInteraction);

        return () => {
            cancelled = true;
            window.removeEventListener("pointerdown", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
            // NOTE: no audio teardown here. See comment above.
        };
        // Intentionally empty deps: setup runs exactly once per mount.
        // Phase-driven track switching is handled in the effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Phase-driven track switch. Whenever the game phase or boss state
    // changes, crossfade to the appropriate track.
    useEffect(() => {
        const target = pickTrack(gamePhase, isBoss);
        // If buffers haven't finished loading yet, crossfadeToTrack is a
        // no-op and the setup effect's startTrack will pick the right
        // track on first play.
        crossfadeToTrack(target);
    }, [gamePhase, isBoss]);

    return null;
}
