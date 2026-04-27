import { useEffect } from "react";
import arkynThemeUrl from "/assets/audio/music/arkyn-theme.mp3?url";
import shopThemeUrl from "/assets/audio/music/shop.mp3?url";
import { useGamePhase, useEnemyIsBoss } from "../arkynStore";
import { getAudioContext } from "../audioContext";

/**
 * Background music manager.
 *
 * Owns two looping music tracks (the main Arkyn theme and the shop
 * theme) as module-level singletons so playback is never interrupted
 * when ArkynOverlay switches between its phase-branch returns and
 * remounts the component. The React component is just a thin driver
 * that loads buffers on demand and crossfades to the appropriate
 * track whenever `gamePhase` changes.
 *
 * Tracks are loaded lazily — only the buffer for the track currently
 * about to play is fetched/decoded. Saves several MB of network +
 * decode on first paint, especially helpful on mobile.
 */

type TrackKey = "theme" | "shop";

const TRACK_URLS: Record<TrackKey, string> = {
    theme: arkynThemeUrl,
    shop: shopThemeUrl,
};

// Resolved buffers, populated lazily by ensureBuffer.
const buffers = new Map<TrackKey, AudioBuffer>();
// In-flight fetch+decode promises, deduped per key so concurrent
// callers share one network round-trip.
const bufferPromises = new Map<TrackKey, Promise<AudioBuffer>>();

// Shared with sfx.ts via audioContext.ts. Nodes live beyond component
// lifecycles — we deliberately do NOT stop sources on unmount.
let activeSource: AudioBufferSourceNode | null = null;
let activeGain: GainNode | null = null;
let activeTrack: TrackKey | null = null;
// Latest track requested via crossfadeToTrack. If a buffer-load
// completes after a newer crossfadeToTrack call, we skip its
// crossfade so we don't override the newer target.
let pendingTargetTrack: TrackKey | null = null;

const BASE_VOLUME = 0.25;
const PITCH_FADE_DURATION = 0.3; // seconds for pitch-shift fade down/up
const CROSSFADE_DURATION = 1.0;  // seconds for track-switch crossfade

/** Lazy-load and decode a single track buffer. Idempotent + race-safe. */
function ensureBuffer(key: TrackKey): Promise<AudioBuffer> {
    const existing = bufferPromises.get(key);
    if (existing) return existing;
    const p = (async () => {
        const ctx = getAudioContext();
        const res = await fetch(TRACK_URLS[key]);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        buffers.set(key, buf);
        return buf;
    })();
    bufferPromises.set(key, p);
    return p;
}

/** Start a track immediately at BASE_VOLUME. Used for the first play. */
function startTrack(key: TrackKey, buf: AudioBuffer): void {
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
 * CROSSFADE_DURATION seconds. Lazy-loads the buffer if it hasn't
 * been fetched yet.
 *
 * If nothing is currently playing the incoming track just starts at
 * BASE_VOLUME (no fade-in needed — there's nothing to fade over).
 *
 * Async loading is handled internally so callers can keep treating
 * this as a fire-and-forget call. If a newer crossfadeToTrack call
 * supersedes us before our buffer-load completes, we skip the
 * crossfade.
 */
export function crossfadeToTrack(key: TrackKey): void {
    if (activeTrack === key && activeSource) return;
    pendingTargetTrack = key;

    const ready = buffers.get(key);
    if (ready) {
        executeCrossfade(key, ready);
        return;
    }

    ensureBuffer(key)
        .then(buf => {
            // A newer call may have changed the target; honor it.
            if (pendingTargetTrack !== key) return;
            executeCrossfade(key, buf);
        })
        .catch(() => { /* will retry on next phase change */ });
}

function executeCrossfade(key: TrackKey, buf: AudioBuffer): void {
    if (activeTrack === key && activeSource) return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (!activeSource || !activeGain) {
        startTrack(key, buf);
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

function pickTrack(gamePhase: string, _isBoss: boolean): TrackKey {
    if (gamePhase === "shop") return "shop";
    return "theme";
}

export default function BackgroundMusic() {
    const gamePhase = useGamePhase();
    const isBoss = useEnemyIsBoss();

    // One-time setup: kick off whichever track is currently
    // appropriate. Deliberately does NOT stop audio on unmount —
    // ArkynOverlay swaps the component between phase branches and we
    // want the music to play uninterrupted across those remounts. The
    // module-level singletons above outlive the React component
    // lifecycle.
    useEffect(() => {
        let cancelled = false;

        const setup = async () => {
            try {
                const target = pickTrack(gamePhase, isBoss);
                const buf = await ensureBuffer(target);
                if (cancelled) return;
                if (!activeSource) startTrack(target, buf);
            } catch { /* will retry on interaction */ }
        };
        setup();

        // Browsers block audio until the first user gesture. If the
        // initial setup didn't manage to start the track (autoplay
        // blocked) the first click/key will kick it.
        const handleInteraction = () => {
            getAudioContext();
            if (!activeSource) {
                const target = pickTrack(gamePhase, isBoss);
                ensureBuffer(target)
                    .then(buf => {
                        if (!activeSource) startTrack(target, buf);
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
    // changes, crossfade to the appropriate track. crossfadeToTrack
    // handles lazy-loading internally so the shop buffer isn't fetched
    // until the player first enters the shop.
    useEffect(() => {
        const target = pickTrack(gamePhase, isBoss);
        crossfadeToTrack(target);
    }, [gamePhase, isBoss]);

    return null;
}
