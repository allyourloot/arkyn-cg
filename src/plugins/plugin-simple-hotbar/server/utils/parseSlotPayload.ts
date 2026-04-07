import { HOTBAR_SIZE } from "../../shared";

export function parseSlotPayload(payload: unknown): { slot: number } | null {
    const parsed = payload !== null && typeof payload === "object"
        ? payload as { slot?: unknown }
        : null;
    const slot = Number(parsed?.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SIZE) return null;
    return { slot };
}
