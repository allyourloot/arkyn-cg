import { createDeepProxy } from "../utils/createDeepProxy";
import type { SaveStatesInterface } from "./SaveStatesInterface";

export class SaveStatesInterfaceImpl implements SaveStatesInterface {
    private readonly _cache: Map<string, unknown>;
    private readonly _versions: Map<string, number>;
    private readonly _proxies: Map<string, unknown>;
    private readonly _dirty: Set<string>;

    constructor(cache: Map<string, unknown>, versions: Map<string, number>, proxies: Map<string, unknown>, dirty: Set<string>) {
        this._cache = cache;
        this._versions = versions;
        this._proxies = proxies;
        this._dirty = dirty;
    }

    get<T>(userId: string): T | null {
        const existing = this._proxies.get(userId);
        if (existing !== undefined) return existing as T;

        const data = this._cache.get(userId);
        if (data === undefined || data === null) return null;
        if (typeof data !== "object") return data as T;

        const proxy = createDeepProxy(data as T & object, () => {
            this._versions.set(userId, (this._versions.get(userId) ?? 0) + 1);
            this._dirty.add(userId);
        });

        this._proxies.set(userId, proxy);
        return proxy;
    }

    getVersion(userId: string): number {
        return this._versions.get(userId) ?? 0;
    }

    isLoaded(userId: string): boolean {
        return this._cache.has(userId);
    }
}
