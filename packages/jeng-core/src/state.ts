import { join } from "node:path";

/** What either kind of state offers: the value under a key, both ways. */
export interface StateMap {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
}

/** A gadget's third argument. */
export interface State {
    /** Shared by every gadget of the session, whatever home it came from. Any value. */
    session: StateMap;
    /** The owning home's `.state`, which outlives the session. Json values only. */
    persistent: StateMap;
}

const FILE = ".state";

export function sessionState(): StateMap {
    const values = new Map<string, unknown>();
    return {
        get: async (key) => values.get(key),
        set: async (key, value) => {
            values.set(key, value);
        },
    };
}

async function read(dir: string): Promise<Record<string, unknown>> {
    const file = join(dir, FILE);
    const state = Bun.file(file);
    if (!(await state.exists())) return {};
    try {
        const parsed = JSON.parse(await state.text());
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            throw new Error("not an object");
        return parsed as Record<string, unknown>;
    } catch (error) {
        throw new Error(`${file} is not a json object: ${(error as Error).message}`);
    }
}

function checkJson(value: unknown, key: string, ancestors: Set<object>): void {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`state "${key}" cannot hold ${value}`);
        return;
    }
    if (typeof value !== "object") throw new Error(`state "${key}" cannot hold a ${typeof value}`);
    if (ancestors.has(value)) throw new Error(`state "${key}" cannot hold a value holding itself`);
    ancestors.add(value);
    for (const item of Array.isArray(value) ? value : Object.values(value))
        checkJson(item, key, ancestors);
    ancestors.delete(value);
}

export function persistentState(dir: string): StateMap {
    return {
        get: async (key) => (await read(dir))[key],
        set: async (key, value) => {
            checkJson(value, key, new Set());
            const state = await read(dir);
            state[key] = value;
            await Bun.$`mkdir -p ${dir}`.quiet();
            await Bun.write(join(dir, FILE), `${JSON.stringify(state, null, 2)}\n`);
        },
    };
}
