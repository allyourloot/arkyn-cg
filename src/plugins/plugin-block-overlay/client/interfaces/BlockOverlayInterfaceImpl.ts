import type { BlockOverlayInterface, RaycastHit } from "./BlockOverlayInterface";

export class BlockOverlayInterfaceImpl implements BlockOverlayInterface {
    private latestHit: RaycastHit | null = null;

    public setLatestHit(hit: RaycastHit | null) {
        this.latestHit = hit;
    }

    public getLatestHit(): RaycastHit | null {
        return this.latestHit;
    }
}
