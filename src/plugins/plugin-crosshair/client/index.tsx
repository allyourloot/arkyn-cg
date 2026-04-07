import { ClientPlugin } from "@core/client";

function Crosshair() {
    return (
        <div
            style={{
                position: "fixed",
                left: "50%",
                top: "50%",
                width: 14,
                height: 14,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
                zIndex: 10000,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: 0,
                    width: 2,
                    height: "100%",
                    background: "rgba(255, 255, 255, 0.95)",
                    transform: "translateX(-50%)",
                }}
            />
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    width: "100%",
                    height: 2,
                    background: "rgba(255, 255, 255, 0.95)",
                    transform: "translateY(-50%)",
                }}
            />
        </div>
    );
}

export function PluginCrosshairClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-crosshair",
        name: "Crosshair",
        version: "0.0.1",
        description: "Displays a centered crosshair overlay on the screen.",
        author: "Matt (@matt)",
        dependencies: [],
        clientOnly: true,
        init: async (runtime) => {
            runtime.addOverlay(<Crosshair />);
        },
    });
}
