export type AuthPluginInterfaceUser = {
    sessionId: string;
    userId: string;
    username: string;
};

export type AuthPluginInterface = {
    getUserBySessionId(sessionId: string): AuthPluginInterfaceUser | null;
    getAllUsers(): AuthPluginInterfaceUser[];
};
