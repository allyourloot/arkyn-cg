import { networkInterfaces } from "node:os";
import { ServerPlugin } from "@core/server";
import { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import QRCode from "qrcode";

const logger = new Logger("QRCodeServer");

function getLanAddress(): string {
    for (const interfaces of Object.values(networkInterfaces())) {
        for (const iface of interfaces ?? []) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }

    return "127.0.0.1";
}

export function PluginQRCodeServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-qr-code",
        name: "QR Code",
        version: "0.0.1",
        description: "Prints a QR code to the server console for mobile testing",
        author: "Hytopia",
        dependencies: [],
        init: async () => {
            const lan = getLanAddress().replaceAll(".", "-");
            const host = `${lan}.dns-is-boring-we-do-ip-addresses.hytopiahosting.com`;
            const clientUrl = new URL(`https://${host}:8180`);
            clientUrl.searchParams.set("serverPort", "8181");

            const playUrl = new URL("https://hytopia.com/play");
            playUrl.searchParams.set("clientUrl", clientUrl.toString());
            const qrUrl = playUrl.toString();

            const qr = await QRCode.toString(qrUrl, { type: "terminal", small: true });
            logger.info(`Scan to open on mobile:\n\n${qr}\n  ${qrUrl}\n`);

            return new PluginState();
        },
    });
}
