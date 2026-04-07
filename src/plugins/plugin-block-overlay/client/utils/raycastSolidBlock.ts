import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import { Vector3 } from "three";
import type { RaycastHit } from "../interfaces/BlockOverlayInterface";

const TARGET_EPSILON = 0.0001;

export function raycastSolidBlock(
    voxelWorld: VoxelWorldClientInterface,
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
): RaycastHit | null {
    if (direction.lengthSq() < TARGET_EPSILON) {
        return null;
    }

    const dir = direction.clone().normalize();
    let currentX = Math.floor(origin.x);
    let currentY = Math.floor(origin.y);
    let currentZ = Math.floor(origin.z);

    const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
    const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
    const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dir.x);
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dir.y);
    const tDeltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dir.z);

    const nextBoundaryX = stepX > 0 ? currentX + 1 : currentX;
    const nextBoundaryY = stepY > 0 ? currentY + 1 : currentY;
    const nextBoundaryZ = stepZ > 0 ? currentZ + 1 : currentZ;

    let tMaxX = stepX === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryX - origin.x) / dir.x;
    let tMaxY = stepY === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryY - origin.y) / dir.y;
    let tMaxZ = stepZ === 0 ? Number.POSITIVE_INFINITY : (nextBoundaryZ - origin.z) / dir.z;

    if (tMaxX < 0) tMaxX = 0;
    if (tMaxY < 0) tMaxY = 0;
    if (tMaxZ < 0) tMaxZ = 0;

    let traveled = 0;
    let lastNormalX = 0;
    let lastNormalY = 0;
    let lastNormalZ = 0;

    while (traveled <= maxDistance) {
        if (voxelWorld.getBlock(currentX, currentY, currentZ) !== 0) {
            return {
                x: currentX,
                y: currentY,
                z: currentZ,
                normalX: lastNormalX,
                normalY: lastNormalY,
                normalZ: lastNormalZ,
            };
        }

        if (tMaxX < tMaxY) {
            if (tMaxX < tMaxZ) {
                currentX += stepX;
                traveled = tMaxX;
                tMaxX += tDeltaX;
                lastNormalX = -stepX;
                lastNormalY = 0;
                lastNormalZ = 0;
            } else {
                currentZ += stepZ;
                traveled = tMaxZ;
                tMaxZ += tDeltaZ;
                lastNormalX = 0;
                lastNormalY = 0;
                lastNormalZ = -stepZ;
            }
        } else if (tMaxY < tMaxZ) {
            currentY += stepY;
            traveled = tMaxY;
            tMaxY += tDeltaY;
            lastNormalX = 0;
            lastNormalY = -stepY;
            lastNormalZ = 0;
        } else {
            currentZ += stepZ;
            traveled = tMaxZ;
            tMaxZ += tDeltaZ;
            lastNormalX = 0;
            lastNormalY = 0;
            lastNormalZ = -stepZ;
        }
    }

    return null;
}
