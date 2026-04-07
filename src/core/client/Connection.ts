import { Client, type Room } from "@colyseus/sdk";
import type { GameState } from "../shared/GameState";

const ROOM_NAME = "game";

export class Connection {
    public connected = false;
    public connecting = false;
    private serverUrl: string;
    private roomOptions?: Record<string, unknown>;
    private _room: Room<GameState> | null = null;

    public constructor(serverUrl: string, roomOptions?: Record<string, unknown>) {
        this.serverUrl = serverUrl;
        this.roomOptions = roomOptions;
    }

    public get room() {
        return this._room;
    }

    public async connect() {
        if (this.connecting || this.connected) {
            return;
        }

        this.connecting = true;
        try {
            const client = new Client(this.serverUrl);
            const room = await client.joinOrCreate<GameState>(ROOM_NAME, this.roomOptions);
            room.onLeave(() => {
                this.connected = false;
                this.connecting = false;
                // Force a full reconnect path after any connection loss.
                window.location.reload();
            });

            this.connected = true;
            this._room = room;
        }
        catch (error) {
            throw error;
        }
        finally {
            this.connecting = false;
        }
    }
}
