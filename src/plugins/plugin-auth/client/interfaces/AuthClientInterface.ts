export type AuthClientUser = {
    sessionId: string;
    userId: string;
    username: string;
};

export type AuthClientInterface = {
    getUserBySessionId(sessionId: string): AuthClientUser | null;
    getAllUsers(): AuthClientUser[];
};
