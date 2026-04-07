export function createDeepProxy<T extends object>(target: T, onMutate: () => void): T {
    return new Proxy(target, {
        get(obj, prop, receiver) {
            const value = Reflect.get(obj, prop, receiver);

            if (typeof value === "object" && value !== null) {
                return createDeepProxy(value as object, onMutate);
            }

            return value;
        },

        set(obj, prop, value, receiver) {
            const result = Reflect.set(obj, prop, value, receiver);
            onMutate();
            return result;
        },

        deleteProperty(obj, prop) {
            const result = Reflect.deleteProperty(obj, prop);
            onMutate();
            return result;
        },
    });
}
