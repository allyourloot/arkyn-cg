import selectRuneUrl from "/assets/audio/sfx/select-rune.ogg?url";
import dropRuneUrl from "/assets/audio/sfx/drop-rune.ogg?url";
import placeRuneUrl from "/assets/audio/sfx/place-rune.mp3?url";
import countUrl from "/assets/audio/sfx/count.ogg?url";
import damageUrl from "/assets/audio/sfx/damage.mp3?url";
import castUrl from "/assets/audio/sfx/cast.mp3?url";
import discardUrl from "/assets/audio/sfx/discard.mp3?url";
import dissolveUrl from "/assets/audio/sfx/dissolve.ogg?url";
import criticalUrl from "/assets/audio/sfx/critical.ogg?url";
import goldUrl from "/assets/audio/sfx/gold.ogg?url";
import goldTotalUrl from "/assets/audio/sfx/gold-total.ogg?url";
import menuOpenUrl from "/assets/audio/sfx/menu-open.ogg?url";
import menuCloseUrl from "/assets/audio/sfx/menu-close.ogg?url";
import roundWinUrl from "/assets/audio/sfx/round-win.ogg?url";
import gameOverUrl from "/assets/audio/sfx/game-over.ogg?url";
import typewriterUrl from "/assets/audio/sfx/typewriter.ogg?url";
import { getAudioContext } from "./audioContext";

// ---- Volume levels ----
const VOL_MENU = 0.45;        // menu open/close
const VOL_RUNE = 0.65;        // select/deselect/drop rune
const VOL_TYPEWRITER = 0.85;  // typewriter loop
const VOL_DEFAULT = 0.9;      // everything else (count, damage, cast, etc.)

// Preload one Audio per sfx so the browser caches the buffer. Each play
// clones the node so rapid plays can overlap without cutting each
// other off.
function makeSfx(url: string, volume: number) {
    const preload = new Audio(url);
    preload.preload = "auto";
    preload.volume = volume;
    return (playbackRate = 1) => {
        const audio = preload.cloneNode() as HTMLAudioElement;
        audio.volume = volume;
        audio.playbackRate = playbackRate;
        audio.play().catch(() => {
            // Browsers block autoplay until first user interaction.
        });
    };
}

// Web Audio API sfx maker — uses AudioBufferSourceNode.detune for
// proper pitch shifting (in cents) without affecting playback speed.
// Uses the shared AudioContext from audioContext.ts so the entire
// plugin runs on a single context (avoids Chrome's context limit).

function makeDetuneSfx(url: string, volume: number) {
    let buffer: AudioBuffer | null = null;
    // Kick off the fetch + decode immediately so the buffer is ready
    // by the time the first play call arrives.
    fetch(url)
        .then(res => res.arrayBuffer())
        .then(arr => getAudioContext().decodeAudioData(arr))
        .then(decoded => { buffer = decoded; })
        .catch(() => { /* silent — sfx just won't play */ });

    return (detuneCents = 0) => {
        if (!buffer) return;
        const ctx = getAudioContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.detune.value = detuneCents;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(ctx.destination);
        source.start();
    };
}

const playRuneSfx = makeSfx(selectRuneUrl, VOL_RUNE);
export const playSelectRune = () => playRuneSfx(1.15);
export const playDeselectRune = () => playRuneSfx(0.85);
export const playPickupRune = () => playRuneSfx(1.3);
export const playDropRune = makeDetuneSfx(dropRuneUrl, VOL_RUNE);
export const playPlaceRune = makeSfx(placeRuneUrl, VOL_DEFAULT);
export const playCount = makeSfx(countUrl, VOL_DEFAULT);
export const playDamage = makeSfx(damageUrl, VOL_DEFAULT);
export const playCast = makeSfx(castUrl, VOL_DEFAULT);
export const playDissolve = makeSfx(dissolveUrl, VOL_DEFAULT);
export const playCritical = makeSfx(criticalUrl, VOL_DEFAULT);
export const playGold = makeSfx(goldUrl, VOL_DEFAULT);
export const playGoldTotal = makeSfx(goldTotalUrl, VOL_DEFAULT);
export const playMenuOpen = makeSfx(menuOpenUrl, VOL_MENU);
export const playMenuClose = makeSfx(menuCloseUrl, VOL_MENU);
export const playRoundWin = makeSfx(roundWinUrl, VOL_DEFAULT);
export const playGameOver = makeSfx(gameOverUrl, VOL_DEFAULT);

// Typewriter SFX — needs to be startable + stoppable so the sound can
// run for the duration of a single typewriter line and be cut off
// cleanly when the line finishes (or when the overlay unmounts mid-
// type). We use a single shared Audio instance instead of the cloning
// pattern above so successive `play()` calls reuse the same node and
// `stop()` actually halts playback. Each `play()` rewinds to the
// start, so calling it once per line gives a clean per-line ratchet.
const typewriterAudio = new Audio(typewriterUrl);
typewriterAudio.preload = "auto";
typewriterAudio.volume = VOL_TYPEWRITER;
export function playTypewriter(): void {
    typewriterAudio.currentTime = 0;
    typewriterAudio.play().catch(() => {
        // Browsers block autoplay until first user interaction.
    });
}
export function stopTypewriter(): void {
    typewriterAudio.pause();
    typewriterAudio.currentTime = 0;
}

// Discard SFX with built-in pitch randomization. Plays one shot of
// `discard.mp3` at a slightly randomized playback rate so a multi-rune
// discard doesn't read as N identical clicks. The ±8% range is subtle
// enough that the sound stays recognisable but distinct per rune.
const playDiscardSfx = makeSfx(discardUrl, VOL_DEFAULT);
export function playDiscard(): void {
    const pitch = 0.92 + Math.random() * 0.16; // 0.92..1.08
    playDiscardSfx(pitch);
}
