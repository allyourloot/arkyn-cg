import selectRuneUrl from "/assets/audio/sfx/select-rune.mp3?url";
import placeRuneUrl from "/assets/audio/sfx/place-rune.mp3?url";

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
