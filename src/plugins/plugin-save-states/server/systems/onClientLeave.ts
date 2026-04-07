import type { AuthPluginInterface } from "@plugins/plugin-auth/server";

export function createOnClientLeaveHandler(
    authInterface: AuthPluginInterface,
    _dirty: Set<string>,
    pendingCleanup: Set<string>,
) {
    return (client: { sessionId: string }) => {
        const authUser = authInterface.getUserBySessionId(client.sessionId);
        if (authUser) {
            pendingCleanup.add(authUser.userId);
        }
    };
}
