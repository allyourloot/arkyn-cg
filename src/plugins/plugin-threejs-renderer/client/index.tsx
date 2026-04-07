import { ClientPlugin, ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import * as THREE from "three";
import { ThreeJSRendererInterfaceImpl } from "./ThreeJSRendererInterfaceImpl";
import type { ThreeJSRendererInterface } from "./ThreeJSRendererInterface";

export function PluginThreeJSRendererClient() : ClientPlugin {
    return new ClientPlugin({
        id: "plugin-threejs-renderer",
        name: "ThreeJS Renderer",
        version: "0.0.1",
        description: "ThreeJS Renderer",
        author: "Hytopia",
        dependencies: [],
        clientOnly: true,
        init
    });
}

function getContainer() {
    return document.getElementById("game-canvas") as HTMLDivElement;
}

let initialized = false;
const logger = new Logger("ThreeJSRenderer");
export async function init(runtime: ClientRuntime) {
    runtime.addOverlay(<div id="game-canvas" style={{ width: "100%", height: "100%" }}/>);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
        75,
        1280 / 720,
        0.1,
        1000,
    );
    const interfaceImpl = new ThreeJSRendererInterfaceImpl(renderer, scene, camera);

    runtime.addInterface("renderer", interfaceImpl);
    runtime.addSystem("PRE_UPDATE", () => {
        if (initialized)
            return;

        const container = getContainer();
        if (!container)
            return;

        logger.info("Initializing...");
        initialized = true;

        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.sortObjects = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        container.appendChild(renderer.domElement);

        scene.background = new THREE.Color(0x1a1a2e);
        
        camera.position.set(0, 200, 5);
        camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        scene.add(directionalLight);

        const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
        };
        animate();

        window.addEventListener("resize", () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });

        logger.info("Initialized");
        interfaceImpl.setInitialized(true);
    });
}

export type { ThreeJSRendererInterface };