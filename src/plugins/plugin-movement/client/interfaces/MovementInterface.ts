export type MovementPlayerTransform = {
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number
};

export type MovementInterface = {
    getPlayers(): Iterable<[string, MovementPlayerTransform]>;
    getPlayer(sessionId: string): MovementPlayerTransform | null;
};
