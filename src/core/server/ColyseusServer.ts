import {
    createRouter,
    defineRoom,
    defineServer,
    playground,
    WebSocketTransport,
} from "colyseus";
import { createServer } from "https";
import express from "express";
import type { Application } from "express";
import { existsSync } from "fs";
import { resolve } from "path";
import { TLS_CERT, TLS_KEY } from "../shared/SSL";
import { GameRoom } from "./GameRoom";
import type { GameState } from "../shared/GameState";
import { Encoder } from "@colyseus/schema";
import { Logger } from "../shared/utils";
import type { ServerAuthHandler, ServerClientJoinHandler, ServerClientLeaveHandler, ServerMessageHandler } from "./ServerRuntime";

const createHttpServer = () => {
    return createServer({
        cert: TLS_CERT,
        key: TLS_KEY,
    });
};

const logger = new Logger("(Core) ColyseusServer");
Encoder.BUFFER_SIZE = 1024 * 1024 * 128; // 128MB

export const createColyseusServer = (
    state: GameState,
    onTick: () => void,
    messageHandlers: Map<string, ServerMessageHandler>,
    authHandler: ServerAuthHandler | null,
    clientJoinHandlers: ServerClientJoinHandler[],
    clientLeaveHandlers: ServerClientLeaveHandler[],
) => {
    const httpServer = createHttpServer();

    return defineServer({
        transport: new WebSocketTransport({
            server: httpServer,
        }),

        rooms: {
            game: defineRoom(GameRoom, {
                onTick,
                state,
                messageHandlers,
                authHandler,
                clientJoinHandlers,
                clientLeaveHandlers,
            }),
        },

        routes: createRouter({
        }),

        express: (app: Application) => {
            app.use("/playground", playground());

            const cwdAssetsPath = resolve(process.cwd(), "assets");
            if (!existsSync(cwdAssetsPath)) {
                logger.warn(`Assets directory was not found. Expected at: ${cwdAssetsPath}`);
                app.get("/", (_req, res) => res.send("{}"));
                return;
            }

            // Serve the bundled single-file client at "/" when it exists
            // (production deploy). In local dev, vite owns ":8180/" and this
            // file isn't built, so fall through to the JSON sentinel.
            const clientHtmlPath = resolve(cwdAssetsPath, "__client/index.html");
            if (existsSync(clientHtmlPath)) {
                app.get("/", (_req, res) => res.sendFile(clientHtmlPath));
            } else {
                app.get("/", (_req, res) => res.send("{}"));
            }

            app.use(express.static(cwdAssetsPath));
            app.use("/assets", express.static(cwdAssetsPath));
            logger.info(`Serving static assets from ${cwdAssetsPath}`);
        },
    });
};
