import { useEffect } from "react";
import arkynThemeUrl from "/assets/audio/music/arkyn-theme.mp3?url";

// Shared audio instance so other modules can adjust playback (e.g. pitch
// down on game over). Created lazily on first mount.
let bgAudio: HTMLAudioElement | null = null;

/** Pitch-shift the background music. 1.0 = normal, < 1 = lower pitch. */
export function setBgMusicPlaybackRate(rate: number): void {
    if (bgAudio) bgAudio.playbackRate = rate;
}

export default function BackgroundMusic() {
    useEffect(() => {
        const audio = new Audio(arkynThemeUrl);
        audio.loop = true;
        audio.volume = 0.15;
        bgAudio = audio;

        const tryPlay = () => {
            audio.play().catch(() => {
                // Browsers block autoplay until user interaction; will retry on first input.
            });
        };

        tryPlay();

        const handleInteraction = () => {
            tryPlay();
            window.removeEventListener("pointerdown", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
        };
        window.addEventListener("pointerdown", handleInteraction);
        window.addEventListener("keydown", handleInteraction);

        return () => {
            window.removeEventListener("pointerdown", handleInteraction);
            window.removeEventListener("keydown", handleInteraction);
            audio.pause();
            audio.src = "";
            bgAudio = null;
        };
    }, []);

    return null;
}
