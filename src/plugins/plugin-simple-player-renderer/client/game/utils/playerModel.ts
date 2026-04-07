import { Logger } from "@core/shared/utils";
import { Box3, MeshBasicMaterial, Object3D, Vector3, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GENERATED_PLAYER_MODEL_URL } from "../../../shared";

const logger = new Logger("SimplePlayerRendererClient");

const PLAYER_MODEL_URL = GENERATED_PLAYER_MODEL_URL;
const TARGET_PLAYER_HEIGHT_UNITS = 1.8;

const loader = new GLTFLoader();
const templateBounds = new Box3();
const templateCenter = new Vector3();
const templateSize = new Vector3();
let playerTemplate: Object3D | null = null;
let playerTemplateLoadInFlight: Promise<void> | null = null;

export function getPlayerTemplate(): Object3D | null {
    return playerTemplate;
}

export function ensurePlayerTemplateLoaded() {
    if (playerTemplate || playerTemplateLoadInFlight) return;

    playerTemplateLoadInFlight = loader.loadAsync(PLAYER_MODEL_URL)
        .then((gltf) => {
            normalizePlayerTemplate(gltf.scene);
            applyUnlitMaterials(gltf.scene);
            playerTemplate = gltf.scene;
            logger.info(`Loaded player model from ${PLAYER_MODEL_URL}`);
        })
        .catch((error) => {
            logger.warn(`Failed to load player model: ${String(error)}`);
        })
        .finally(() => {
            playerTemplateLoadInFlight = null;
        });
}

function normalizePlayerTemplate(template: Object3D) {
    template.updateMatrixWorld(true);
    templateBounds.setFromObject(template);
    templateBounds.getCenter(templateCenter);
    templateBounds.getSize(templateSize);

    const modelHeight = templateSize.y > Number.EPSILON ? templateSize.y : 1;
    const uniformScale = TARGET_PLAYER_HEIGHT_UNITS / modelHeight;
    template.scale.setScalar(uniformScale);
    template.updateMatrixWorld(true);

    templateBounds.setFromObject(template);
    templateBounds.getCenter(templateCenter);
    const minY = templateBounds.min.y;
    template.position.set(-templateCenter.x, -minY, -templateCenter.z);
}

function applyUnlitMaterials(template: Object3D) {
    template.traverse((child) => {
        const mesh = child as Object3D & { isMesh?: boolean; material?: Material | Material[] };
        if (!mesh.isMesh || !mesh.material) return;

        if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(createUnlitMaterial);
            return;
        }

        mesh.material = createUnlitMaterial(mesh.material);
    });
}

function createUnlitMaterial(material: Material): Material {
    const source = material as Material & {
        map?: unknown;
        color?: unknown;
        transparent?: boolean;
        opacity?: number;
        alphaTest?: number;
        side?: number;
        depthWrite?: boolean;
        depthTest?: boolean;
    };

    const unlit = new MeshBasicMaterial({
        map: source.map as MeshBasicMaterial["map"],
        color: source.color as MeshBasicMaterial["color"],
        transparent: source.transparent,
        opacity: source.opacity,
        alphaTest: source.alphaTest,
        side: source.side,
        depthWrite: source.depthWrite,
        depthTest: source.depthTest,
    });
    unlit.name = `${material.name || "material"}-unlit`;
    material.dispose();
    return unlit;
}
