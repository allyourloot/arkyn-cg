import { Logger } from "@core/shared/utils";
import {
    Group,
    Mesh,
    MeshBasicMaterial,
    NearestFilter,
    Object3D,
    SRGBColorSpace,
    Texture,
    TextureLoader,
    type Material,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const logger = new Logger("PlayerCosmeticsClient");

const REPLACES_LIMB_FLAG = "REPLACES_LIMB";
const HIDES_HAIR_FLAG = "HIDES_HAIR";
const SLOT_SOCKET_PREFIX = "player-cosmetic-slot-";
const HEAD_ANCHOR_NAME = "head-anchor";
const HAIR_SOCKET_NAME = "player-hair-socket";
const HAIR_MODEL_NAME = "player-hair-model";

const textureLoader = new TextureLoader();
textureLoader.setCrossOrigin("anonymous");

const gltfLoader = new GLTFLoader();
gltfLoader.setCrossOrigin("anonymous");

const cosmeticTemplateCache = new Map<string, Promise<Object3D | null>>();

export const COSMETIC_SLOT_NAMES = [
    "head",
    "back",
    "torso",
    "leftArm",
    "rightArm",
    "leftHand",
    "rightHand",
    "leftLeg",
    "rightLeg",
    "leftFoot",
    "rightFoot",
] as const;

export type CosmeticSlotName = typeof COSMETIC_SLOT_NAMES[number];

export type CosmeticLoadoutItem = {
    flags?: string[] | null;
    modelUrl?: string | null;
    textureUrl?: string | null;
};

export type PlayerLoadout = Partial<Record<CosmeticSlotName, CosmeticLoadoutItem | null>>;

const SLOT_ATTACH_TARGETS: Record<CosmeticSlotName, string[]> = {
    head: ["head-anchor"],
    back: ["back-anchor"],
    torso: ["torso-anchor"],
    leftArm: ["arm-left-anchor"],
    rightArm: ["arm-right-anchor"],
    leftHand: ["hand-left-anchor"],
    rightHand: ["hand-right-anchor"],
    leftLeg: ["leg-left-anchor"],
    rightLeg: ["leg-right-anchor"],
    leftFoot: ["foot-left-anchor"],
    rightFoot: ["foot-right-anchor"],
};

const SLOT_REPLACED_MESHES: Partial<Record<CosmeticSlotName, string[]>> = {
    head: ["head-geo"],
    torso: ["upper-geo", "lower-geo"],
    leftArm: ["arm-left-geo"],
    rightArm: ["arm-right-geo"],
    leftHand: ["hand-left-geo"],
    rightHand: ["hand-right-geo"],
    leftLeg: ["leg-left-geo"],
    rightLeg: ["leg-right-geo"],
    leftFoot: ["foot-left-geo"],
    rightFoot: ["foot-right-geo"],
};

const HAIR_MESH_NAMES = [HAIR_MODEL_NAME, HAIR_SOCKET_NAME];
const skinTextureCache = new Map<string, Promise<Texture | null>>();

function configureTexture(texture: Texture) {
    texture.flipY = false;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
}

function applyTextureToAllMeshes(root: Object3D, texture: Texture) {
    root.traverse((child) => {
        if (!(child instanceof Mesh)) return;

        const materials: Material[] = Array.isArray(child.material)
            ? child.material
            : [child.material];

        for (const material of materials) {
            const target = material as Material & { map?: Texture | null };
            if ("map" in target) {
                target.map = texture;
                target.needsUpdate = true;
            }
        }
    });
}

function applyUnlitMaterials(root: Object3D) {
    root.traverse((child) => {
        if (!(child instanceof Mesh)) return;

        const materials: Material[] = Array.isArray(child.material)
            ? child.material
            : [child.material];

        const unlitMaterials = materials.map((mat) => {
            const source = mat as Material & {
                map?: unknown;
                color?: unknown;
                transparent?: boolean;
                opacity?: number;
                alphaTest?: number;
                side?: number;
            };

            const unlit = new MeshBasicMaterial({
                map: source.map as MeshBasicMaterial["map"],
                color: source.color as MeshBasicMaterial["color"],
                transparent: source.transparent,
                opacity: source.opacity,
                alphaTest: source.alphaTest,
                side: source.side,
            });

            mat.dispose();
            return unlit;
        });

        child.material = Array.isArray(child.material) ? unlitMaterials : unlitMaterials[0];
    });
}

export async function loadCosmeticTemplate(modelUrl: string, textureUrl: string): Promise<Object3D | null> {
    const cacheKey = `${modelUrl}|${textureUrl}`;
    const cached = cosmeticTemplateCache.get(cacheKey);
    if (cached) return cached;

    const promise = (async (): Promise<Object3D | null> => {
        const gltf = await gltfLoader.loadAsync(modelUrl);

        if (textureUrl) {
            const texture = await textureLoader.loadAsync(textureUrl);
            configureTexture(texture);
            applyTextureToAllMeshes(gltf.scene, texture);
        }

        applyUnlitMaterials(gltf.scene);
        return gltf.scene;
    })();

    cosmeticTemplateCache.set(cacheKey, promise);
    return promise;
}

export function clearHairSocket(playerRoot: Object3D) {
    const anchor = findChildByName(playerRoot, HEAD_ANCHOR_NAME);
    if (!anchor) return;

    const existing = anchor.children.find((child) => child.name === HAIR_SOCKET_NAME);
    if (existing) {
        anchor.remove(existing);
    }
}

export async function loadHairTemplate(modelUrl: string, textureUrl: string): Promise<Object3D | null> {
    return loadCosmeticTemplate(modelUrl, textureUrl);
}

function findChildByName(root: Object3D, name: string): Object3D | null {
    if (root.name === name) return root;

    for (const child of root.children) {
        const found = findChildByName(child, name);
        if (found) return found;
    }

    return null;
}

function findAttachTarget(root: Object3D, slot: CosmeticSlotName): Object3D | null {
    const candidateNames = SLOT_ATTACH_TARGETS[slot];
    for (const name of candidateNames) {
        const target = findChildByName(root, name);
        if (target) return target;
    }

    return null;
}

function ensureSlotSocket(target: Object3D, slot: CosmeticSlotName): Object3D {
    const socketName = `${SLOT_SOCKET_PREFIX}${slot}`;
    const existing = target.children.find((child) => child.name === socketName);
    if (existing) return existing;

    const socket = new Group();
    socket.name = socketName;
    target.add(socket);
    return socket;
}

function ensureHairSocket(playerRoot: Object3D): Object3D | null {
    const anchor = findChildByName(playerRoot, HEAD_ANCHOR_NAME);
    if (!anchor) return null;

    const existing = anchor.children.find((child) => child.name === HAIR_SOCKET_NAME);
    if (existing) return existing;

    const socket = new Group();
    socket.name = HAIR_SOCKET_NAME;
    anchor.add(socket);
    return socket;
}

export function clearAllCosmeticSockets(root: Object3D) {
    root.traverse((node) => {
        const cosmeticChildren = node.children.filter((child) => child.name.startsWith(SLOT_SOCKET_PREFIX));
        for (const child of cosmeticChildren) {
            node.remove(child);
        }
    });
}

export function restoreHiddenNodes(root: Object3D, hiddenByUuid: Map<string, boolean>) {
    if (hiddenByUuid.size === 0) return;

    root.traverse((node) => {
        const previousVisibility = hiddenByUuid.get(node.uuid);
        if (previousVisibility !== undefined) {
            node.visible = previousVisibility;
        }
    });

    hiddenByUuid.clear();
}

function hideNodesByName(
    root: Object3D,
    names: string[],
    hiddenByUuid: Map<string, boolean>,
    options?: { allowNonMesh?: boolean },
) {
    if (names.length === 0) return;
    const namesSet = new Set(names);
    const allowNonMesh = options?.allowNonMesh ?? false;

    root.traverse((node) => {
        if (!namesSet.has(node.name)) return;

        if (!(node instanceof Mesh) && !allowNonMesh) {
            return;
        }

        if (!hiddenByUuid.has(node.uuid)) {
            hiddenByUuid.set(node.uuid, node.visible);
        }

        node.visible = false;
    });
}

export function attachCosmeticToSlot(
    playerRoot: Object3D,
    slot: CosmeticSlotName,
    template: Object3D,
): boolean {
    const target = findAttachTarget(playerRoot, slot);
    if (!target) {
        logger.warn(`No attach target found for slot ${slot}`);
        return false;
    }

    const socket = ensureSlotSocket(target, slot);
    while (socket.children.length > 0) {
        socket.remove(socket.children[0]);
    }

    const clone = template.clone(true);
    clone.name = `${SLOT_SOCKET_PREFIX}${slot}-model`;
    socket.add(clone);
    return true;
}

export function attachHairToPlayer(playerRoot: Object3D, hairTemplate: Object3D): boolean {
    const socket = ensureHairSocket(playerRoot);
    if (!socket) {
        logger.warn("No head-anchor found on player model");
        return false;
    }

    while (socket.children.length > 0) {
        socket.remove(socket.children[0]);
    }

    const clone = hairTemplate.clone(true);
    clone.name = HAIR_MODEL_NAME;
    socket.add(clone);
    return true;
}

export function applyCosmeticFlags(
    playerRoot: Object3D,
    slot: CosmeticSlotName,
    flags: string[] | null | undefined,
    hiddenByUuid: Map<string, boolean>,
) {
    if (!flags || flags.length === 0) return;

    if (flags.includes(REPLACES_LIMB_FLAG)) {
        hideNodesByName(playerRoot, SLOT_REPLACED_MESHES[slot] ?? [], hiddenByUuid);
    }

    if (flags.includes(HIDES_HAIR_FLAG)) {
        hideNodesByName(playerRoot, HAIR_MESH_NAMES, hiddenByUuid, { allowNonMesh: true });
    }
}

function isAppearanceMesh(name: string): boolean {
    return name.trim().endsWith("-geo");
}

function traverseSkippingHair(node: Object3D, callback: (child: Object3D) => void) {
    if (node.name === HAIR_SOCKET_NAME) return;
    callback(node);
    for (const child of node.children) {
        traverseSkippingHair(child, callback);
    }
}

export function cloneAppearanceMaterials(root: Object3D) {
    traverseSkippingHair(root, (child) => {
        if (!(child instanceof Mesh) || !isAppearanceMesh(child.name)) return;

        if (Array.isArray(child.material)) {
            child.material = child.material.map((material: Material) => material.clone());
        } else {
            child.material = child.material.clone();
        }
    });
}

export async function loadSkinTexture(skinTextureUrl: string): Promise<Texture | null> {
    const cached = skinTextureCache.get(skinTextureUrl);
    if (cached) return cached;

    const promise = (async (): Promise<Texture | null> => {
        const texture = await textureLoader.loadAsync(skinTextureUrl);
        configureTexture(texture);
        return texture;
    })();

    skinTextureCache.set(skinTextureUrl, promise);
    return promise;
}

export function applySkinTextureToPlayer(root: Object3D, texture: Texture) {
    const visited = new Set<Material>();

    traverseSkippingHair(root, (child) => {
        if (!(child instanceof Mesh) || !isAppearanceMesh(child.name)) return;

        const materials: Material[] = Array.isArray(child.material)
            ? child.material
            : [child.material];

        for (const material of materials) {
            if (visited.has(material)) continue;
            visited.add(material);

            const target = material as Material & { map?: Texture | null };
            if ("map" in target) {
                target.map = texture;
                target.needsUpdate = true;
            }
        }
    });
}
