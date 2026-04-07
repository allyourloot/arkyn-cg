import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import * as THREE from "three";
import { GLSL3 } from "three";
import type { GradientSkyboxState } from "../shared";

const logger = new Logger("GradientSkyboxClient");
const MAX_COLORS = 8;

const vertexShader = /* glsl */ `
out vec3 vWorldDirection;

void main() {
    vWorldDirection = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w;
}
`;

const fragmentShader = /* glsl */ `
#define MAX_COLORS ${MAX_COLORS}

uniform vec3 gradientColors[MAX_COLORS];
uniform float gradientPositions[MAX_COLORS];
uniform int gradientColorCount;

in vec3 vWorldDirection;
out vec4 fragColor;

void main() {
    float t = normalize(vWorldDirection).y * 0.5 + 0.5;

    vec3 colorA = gradientColors[0];
    vec3 colorB = gradientColors[1];
    float posA = gradientPositions[0];
    float posB = gradientPositions[1];

    int count = gradientColorCount;
    for (int i = 0; i < MAX_COLORS - 1; i++) {
        if (i < count - 1 && t >= gradientPositions[i]) {
            colorA = gradientColors[i];
            colorB = gradientColors[i + 1];
            posA = gradientPositions[i];
            posB = gradientPositions[i + 1];
        }
    }

    float segT = (posB > posA) ? clamp((t - posA) / (posB - posA), 0.0, 1.0) : 0.0;
    vec3 srgbColor = mix(colorA, colorB, segT);
    fragColor = vec4(pow(srgbColor, vec3(2.2)), 1.0);
}
`;

function hexToSRGBVec3(hex: string): THREE.Vector3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new THREE.Vector3(r, g, b);
}

export type SkyboxInterface = {
    getAverageColor(): THREE.Color;
};

export function PluginGradientSkyboxClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-gradient-skybox",
        name: "Gradient Skybox",
        version: "0.0.1",
        description: "Gradient skybox rendered in a custom shader",
        author: "Hytopia",
        dependencies: ["plugin-threejs-renderer"],
        init: async (runtime: ClientRuntime, pluginState: PluginState) => {
            const renderer = runtime.getInterface<ThreeJSRendererInterface>("renderer");
            if (!renderer) {
                logger.error("Renderer interface not found");
                return;
            }

            const state = pluginState as GradientSkyboxState;
            const scene = renderer.getScene();

            const hexColors = Array.from(state.colors) as string[];
            const rawPositions = Array.from(state.positions) as number[];

            if (hexColors.length > MAX_COLORS) {
                logger.warn(`GradientSkybox supports up to ${MAX_COLORS} colors. Truncating extras.`);
                hexColors.length = MAX_COLORS;
                rawPositions.length = MAX_COLORS;
            }

            if (hexColors.length < 2) {
                logger.warn("GradientSkybox requires at least 2 colors. Padding with black.");
                while (hexColors.length < 2) hexColors.push("#000000");
            }

            const normalizedPositions = hexColors.map((_, i) =>
                (rawPositions[i] ?? (i / (hexColors.length - 1)) * 100) / 100,
            );
            while (normalizedPositions.length < MAX_COLORS) normalizedPositions.push(1.0);

            const colorVecs: THREE.Vector3[] = hexColors.map(hexToSRGBVec3);
            const lastVec = colorVecs[colorVecs.length - 1];
            while (colorVecs.length < MAX_COLORS) colorVecs.push(lastVec.clone());

            const skyMaterial = new THREE.ShaderMaterial({
                glslVersion: GLSL3,
                vertexShader,
                fragmentShader,
                uniforms: {
                    gradientColors: { value: colorVecs },
                    gradientPositions: { value: normalizedPositions },
                    gradientColorCount: { value: hexColors.length },
                },
                side: THREE.BackSide,
                depthWrite: false,
                depthTest: false,
            });

            const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial);
            skyMesh.renderOrder = -1000;
            skyMesh.frustumCulled = false;
            scene.add(skyMesh);

            skyMesh.onBeforeRender = (_renderer, _scene, cam) => {
                skyMesh.position.copy(cam.position);
                skyMesh.updateMatrixWorld(true);
            };

            const avgLinear = new THREE.Color(0, 0, 0);
            for (const hex of hexColors) {
                const color = new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
                avgLinear.r += color.r;
                avgLinear.g += color.g;
                avgLinear.b += color.b;
            }
            avgLinear.multiplyScalar(1 / hexColors.length);

            runtime.addInterface("skybox", {
                getAverageColor: () => avgLinear,
            });
            logger.info(`Gradient skybox loaded with ${hexColors.length} colors`);
        },
    });
}
