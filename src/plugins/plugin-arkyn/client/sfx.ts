import selectRuneUrl from "/assets/audio/sfx/select-rune.mp3?url";
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
import gameOverUrl from "/assets/audio/sfx/game-over.ogg?url";
import typewriterUrl from "/assets/audio/sfx/typewriter.ogg?url";

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

const playRuneSfx = makeSfx(selectRuneUrl, 0.9);
export const playSelectRune = () => playRuneSfx(1.15);
export const playDeselectRune = () => playRuneSfx(0.85);
export const playPickupRune = () => playRuneSfx(1.3);
export const playDropRune = () => playRuneSfx(0.7);
export const playPlaceRune = makeSfx(placeRuneUrl, 0.9);
export const playCount = makeSfx(countUrl, 0.9);
export const playDamage = makeSfx(damageUrl, 0.9);
export const playCast = makeSfx(castUrl, 0.9);
export const playDissolve = makeSfx(dissolveUrl, 0.9);
export const playCritical = makeSfx(criticalUrl, 0.9);
export const playGold = makeSfx(goldUrl, 0.9);
export const playGoldTotal = makeSfx(goldTotalUrl, 0.9);
export const playMenuOpen = makeSfx(menuOpenUrl, 0.9);
export const playMenuClose = makeSfx(menuCloseUrl, 0.9);
export const playGameOver = makeSfx(gameOverUrl, 0.9);

// Typewriter SFX — needs to be startable + stoppable so the sound can
// run for the duration of a single typewriter line and be cut off
// cleanly when the line finishes (or when the overlay unmounts mid-
// type). We use a single shared Audio instance instead of the cloning
// pattern above so successive `play()` calls reuse the same node and
// `stop()` actually halts playback. Each `play()` rewinds to the
// start, so calling it once per line gives a clean per-line ratchet.
const typewriterAudio = new Audio(typewriterUrl);
typewriterAudio.preload = "auto";
typewriterAudio.volume = 0.85;
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
const playDiscardSfx = makeSfx(discardUrl, 0.9);
export function playDiscard(): void {
    const pitch = 0.92 + Math.random() * 0.16; // 0.92..1.08
    playDiscardSfx(pitch);
}
