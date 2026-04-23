import selectRuneUrl from "/assets/audio/sfx/select-rune.mp3?url";
import deselectRuneUrl from "/assets/audio/sfx/deselect-rune.mp3?url";
import dropRuneUrl from "/assets/audio/sfx/drop-rune.mp3?url";
import placeRuneUrl from "/assets/audio/sfx/place-rune.mp3?url";
import countUrl from "/assets/audio/sfx/count.mp3?url";
import damageUrl from "/assets/audio/sfx/damage.mp3?url";
import castRuneUrl from "/assets/audio/sfx/cast-rune.mp3?url";
import discardUrl from "/assets/audio/sfx/discard.mp3?url";
import dissolveUrl from "/assets/audio/sfx/dissolve.mp3?url";
import criticalUrl from "/assets/audio/sfx/critical.mp3?url";
import goldUrl from "/assets/audio/sfx/gold.mp3?url";
import goldTotalUrl from "/assets/audio/sfx/gold-total.mp3?url";
import menuOpenUrl from "/assets/audio/sfx/menu-open.mp3?url";
import menuCloseUrl from "/assets/audio/sfx/menu-close.mp3?url";
import roundWinUrl from "/assets/audio/sfx/round-win.mp3?url";
import gameOverUrl from "/assets/audio/sfx/game-over.mp3?url";
import buyUrl from "/assets/audio/sfx/buy.mp3?url";
import buttonUrl from "/assets/audio/sfx/button.mp3?url";
import typewriterUrl from "/assets/audio/sfx/typewriter.mp3?url";
import addConsumableUrl from "/assets/audio/sfx/add-consumable.mp3?url";
import { getAudioContext } from "./audioContext";

// ---- Volume levels ----
const VOL_MENU = 0.45;        // menu open/close
const VOL_RUNE = 0.65;        // select/deselect/drop rune
const VOL_TYPEWRITER = 0.85;  // typewriter loop
const VOL_DEFAULT = 0.9;      // everything else (count, damage, cast, etc.)

// Web Audio SFX loader. Fetches + decodes the buffer once; each play
// creates a fresh BufferSourceNode so rapid calls can overlap without
// cutting each other off. Replaces an earlier HTMLAudioElement
// clone-and-play approach that silently failed on iOS — cloned audio
// elements aren't individually unlocked by the first-gesture rule, and
// the phone's ring/silent switch mutes all HTMLAudioElement playback.
// Web Audio sidesteps both: one ctx.resume() on first gesture (see
// audioContext.ts) unlocks every future source node, and Web Audio
// playback isn't subject to the ringer mute.
//
// The (playbackRate) parameter matches the old HTMLAudioElement API —
// it changes both pitch and speed together, same audible result as
// the original HTMLAudioElement.playbackRate.
function makeSfx(url: string, volume: number) {
    let buffer: AudioBuffer | null = null;
    fetch(url)
        .then(res => res.arrayBuffer())
        .then(arr => getAudioContext().decodeAudioData(arr))
        .then(decoded => { buffer = decoded; })
        .catch(err => {
            // iOS < 17 can't decode Ogg Vorbis — decodeAudioData rejects
            // with EncodingError / "Unable to decode audio data". Surface
            // the failure so the console shows which files failed.
            console.warn(`[sfx] decode failed for ${url}:`, err);
        });

    return (playbackRate = 1) => {
        if (!buffer) return;
        const ctx = getAudioContext();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        source.connect(gain).connect(ctx.destination);
        source.start();
    };
}

// Pitch-only shift via detune (cents), keeps playback speed constant.
// Same Web Audio path as makeSfx, but uses source.detune instead of
// source.playbackRate so the rune drop retains its original tempo
// even when pitched up/down.
function makeDetuneSfx(url: string, volume: number) {
    let buffer: AudioBuffer | null = null;
    fetch(url)
        .then(res => res.arrayBuffer())
        .then(arr => getAudioContext().decodeAudioData(arr))
        .then(decoded => { buffer = decoded; })
        .catch(() => { /* silent */ });

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

export function playSelectRune(): void {
    playRuneSfx();
}

const playDeselectSfx = makeSfx(deselectRuneUrl, VOL_RUNE);
export function playDeselectRune(): void {
    playDeselectSfx();
}
export const playPickupRune = () => playRuneSfx(1.3);
export const playDropRune = makeDetuneSfx(dropRuneUrl, VOL_RUNE);
export const playPlaceRune = makeSfx(placeRuneUrl, VOL_DEFAULT);
export const playCount = makeSfx(countUrl, VOL_DEFAULT);
export const playDamage = makeSfx(damageUrl, VOL_DEFAULT);
export const playCastRune = makeSfx(castRuneUrl, VOL_DEFAULT);
export const playDissolve = makeSfx(dissolveUrl, VOL_DEFAULT);
export const playCritical = makeSfx(criticalUrl, VOL_DEFAULT);
export const playGold = makeSfx(goldUrl, VOL_DEFAULT);
export const playGoldTotal = makeSfx(goldTotalUrl, VOL_DEFAULT);
export const playMenuOpen = makeSfx(menuOpenUrl, VOL_MENU);
export const playMenuClose = makeSfx(menuCloseUrl, VOL_MENU);
export const playRoundWin = makeSfx(roundWinUrl, VOL_DEFAULT);
export const playGameOver = makeSfx(gameOverUrl, VOL_DEFAULT);
export const playBuy = makeSfx(buyUrl, VOL_DEFAULT);
export const playButton = makeSfx(buttonUrl, VOL_DEFAULT);
export const playAddConsumable = makeSfx(addConsumableUrl, VOL_DEFAULT);

// Typewriter SFX — looping sound that needs clean stop/restart per line.
// Uses a single live BufferSourceNode with loop=true. playTypewriter
// stops any previous loop then starts a fresh source (a BufferSource
// can only be start()ed once, so a restart means a new source).
// stopTypewriter kills the active source immediately. Replaces the
// old HTMLAudioElement which was subject to the ring/silent switch.
let typewriterBuffer: AudioBuffer | null = null;
let typewriterSource: AudioBufferSourceNode | null = null;
let typewriterGain: GainNode | null = null;
fetch(typewriterUrl)
    .then(res => res.arrayBuffer())
    .then(arr => getAudioContext().decodeAudioData(arr))
    .then(decoded => { typewriterBuffer = decoded; })
    .catch(() => { /* silent */ });

export function playTypewriter(): void {
    if (!typewriterBuffer) return;
    stopTypewriter();
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = typewriterBuffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = VOL_TYPEWRITER;
    source.connect(gain).connect(ctx.destination);
    source.start();
    typewriterSource = source;
    typewriterGain = gain;
}

export function stopTypewriter(): void {
    if (typewriterSource) {
        try { typewriterSource.stop(); } catch { /* already stopped */ }
        typewriterSource.disconnect();
        typewriterSource = null;
    }
    if (typewriterGain) {
        typewriterGain.disconnect();
        typewriterGain = null;
    }
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
