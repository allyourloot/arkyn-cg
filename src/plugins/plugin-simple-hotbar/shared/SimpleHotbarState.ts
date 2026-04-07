import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";
import { EMPTY_HOTBAR_SLOT_VALUE, HOTBAR_SIZE } from "./hotbarConstants";

function createEmptyHotbarSlots() {
    return new ArraySchema<number>(
        ...Array.from({ length: HOTBAR_SIZE }, () => EMPTY_HOTBAR_SLOT_VALUE),
    );
}

export class PlayerHotbarState extends Schema {
    @type(["number"]) slots = createEmptyHotbarSlots();
    @type("number") selectedSlot = 0;
}

export class SimpleHotbarState extends PluginState {
    @type({ map: PlayerHotbarState })
    players = new MapSchema<PlayerHotbarState>();
}
