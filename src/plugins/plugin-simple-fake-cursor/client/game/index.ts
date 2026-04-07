import type { ClientRuntime } from "@core/client";
import {
    getCursorVisible,
    getFakeCursorPosition,
    initFakeCursor,
    onFakeCursorPointerEvent,
    setFakeCursorVisible,
    subscribe,
} from "../fakeCursorStore";

export function initSimpleFakeCursorGame(runtime: ClientRuntime) {
    initFakeCursor();

    runtime.addInterface("simple-fake-cursor", {
        subscribe,
        getFakeCursorPosition,
        getCursorVisible,
        setFakeCursorVisible,
        onFakeCursorPointerEvent,
    });
}
