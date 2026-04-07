export type RaycastHit = {
    x: number;
    y: number;
    z: number;
    normalX: number;
    normalY: number;
    normalZ: number;
};

export interface BlockOverlayInterface {
    getLatestHit(): RaycastHit | null;
}
