import { useEffect } from "react";
import arkynThemeUrl from "/assets/audio/music/arkyn-theme.mp3?url";

export default function BackgroundMusic() {
    useEffect(() => {
        const audio = new Audio(arkynThemeUrl);
        audio.loop = true;
        audio.volume = 0.15;

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
        };
    }, []);

    return null;
}
