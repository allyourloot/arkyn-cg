import type { Vector3 } from "three";

export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.6;

export interface PlayerPhysicsState {
    velocityY: number;
    grounded: boolean;
}

type IsSolidFn = (bx: number, by: number, bz: number) => boolean;

export function getOverlappingBlocks(
    px: number,
    py: number,
    pz: number,
    isSolid: IsSolidFn,
) {
    const feetY = py - PLAYER_EYE_HEIGHT;

    const minX = px - PLAYER_HALF_WIDTH;
    const maxX = px + PLAYER_HALF_WIDTH;
    const minY = feetY;
    const maxY = feetY + PLAYER_HEIGHT;
    const minZ = pz - PLAYER_HALF_WIDTH;
    const maxZ = pz + PLAYER_HALF_WIDTH;

    const result: { bx: number; by: number; bz: number }[] = [];

    for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
        for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
            for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
                if (!isSolid(bx, by, bz)) continue;
                if (maxX <= bx || minX >= bx + 1) continue;
                if (maxY <= by || minY >= by + 1) continue;
                if (maxZ <= bz || minZ >= bz + 1) continue;
                result.push({ bx, by, bz });
            }
        }
    }

    return result;
}

export function moveAndCollide(
    pos: Vector3,
    dx: number,
    dy: number,
    dz: number,
    physics: PlayerPhysicsState,
    isSolid: IsSolidFn,
) {
    pos.y += dy;
    let overlaps = getOverlappingBlocks(pos.x, pos.y, pos.z, isSolid);
    if (overlaps.length > 0) {
        if (dy <= 0) {
            let highestTop = -Infinity;
            for (const { by } of overlaps) {
                if (by + 1 > highestTop) highestTop = by + 1;
            }
            pos.y = highestTop + PLAYER_EYE_HEIGHT;
            physics.grounded = true;
            physics.velocityY = 0;
        } else {
            let lowestBottom = Infinity;
            for (const { by } of overlaps) {
                if (by < lowestBottom) lowestBottom = by;
            }
            pos.y = lowestBottom - (PLAYER_HEIGHT - PLAYER_EYE_HEIGHT);
            physics.velocityY = 0;
        }
    } else {
        physics.grounded = false;
    }

    pos.x += dx;
    overlaps = getOverlappingBlocks(pos.x, pos.y, pos.z, isSolid);
    if (overlaps.length > 0) {
        if (dx > 0) {
            let nearest = Infinity;
            for (const { bx } of overlaps) {
                if (bx < nearest) nearest = bx;
            }
            pos.x = nearest - PLAYER_HALF_WIDTH;
        } else {
            let nearest = -Infinity;
            for (const { bx } of overlaps) {
                if (bx + 1 > nearest) nearest = bx + 1;
            }
            pos.x = nearest + PLAYER_HALF_WIDTH;
        }
    }

    pos.z += dz;
    overlaps = getOverlappingBlocks(pos.x, pos.y, pos.z, isSolid);
    if (overlaps.length > 0) {
        if (dz > 0) {
            let nearest = Infinity;
            for (const { bz } of overlaps) {
                if (bz < nearest) nearest = bz;
            }
            pos.z = nearest - PLAYER_HALF_WIDTH;
        } else {
            let nearest = -Infinity;
            for (const { bz } of overlaps) {
                if (bz + 1 > nearest) nearest = bz + 1;
            }
            pos.z = nearest + PLAYER_HALF_WIDTH;
        }
    }
}
