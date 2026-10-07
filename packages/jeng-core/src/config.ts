import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { at } from "./at";
import type { ModelConfig } from "./model";
import { resolveStyle, type Style, type StyleParts } from "./style";

export interface Config {
    homes: string[];
    model: ModelConfig;
    style: Style;
    /** The file it was read from, so a window can say which config it is on. */
    path?: string;
}

interface FileConfig {
    homes?: string[];
    model?: Partial<ModelConfig>;
    style?: string | StyleParts;
}

const FILE_NAME = "jeng.json";

const MODEL_DEFAULTS = {
    baseUrl: "http://localhost:11434/v1",
    apiKey: undefined,
    model: "gpt-4o-mini",
    contextWindow: 8192,
} as const;

const MODEL_FIELDS = {
    baseUrl: "string",
    apiKey: "string",
    model: "string",
    contextWindow: "number",
} as const;

const withDefaults = (model: Partial<ModelConfig>): ModelConfig => ({
    baseUrl: (model.baseUrl ?? MODEL_DEFAULTS.baseUrl).replace(/\/$/, ""),
    apiKey: model.apiKey ?? MODEL_DEFAULTS.apiKey,
    model: model.model ?? MODEL_DEFAULTS.model,
    contextWindow: model.contextWindow ?? MODEL_DEFAULTS.contextWindow,
});

export function defaultHome(): string {
    return join(homedir(), ".jeng");
}

export function defaultModel(): ModelConfig {
    return { ...MODEL_DEFAULTS };
}

function resolveHomes(
    homeArgs: string[] = [],
    env: Record<string, string | undefined> = process.env,
): string[] {
    if (homeArgs.length > 0) return homeArgs;
    if (env.JENG_HOME) return env.JENG_HOME.split(";").filter(Boolean);
    return [defaultHome()];
}

function resolveConfig(env: Record<string, string | undefined> = process.env): ModelConfig {
    const window = Number(env.JENG_CONTEXT);
    return withDefaults({
        baseUrl: env.JENG_BASE_URL,
        apiKey: env.JENG_API_KEY ?? env.OPENAI_API_KEY,
        model: env.JENG_MODEL,
        contextWindow: Number.isFinite(window) && window > 0 ? window : undefined,
    });
}

function fail(path: string, reason: string): never {
    throw new Error(`invalid config at ${path}: ${reason}`);
}

/** The one shape check three keys share, so "a list, not an object" is said once. */
function objectAt(path: string, value: unknown, key: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return fail(path, `${key} must be an object`);
    return value as Record<string, unknown>;
}

const homeAt = (path: string, home: string) => at(dirname(path), home);

async function loadConfigFile(path: string): Promise<FileConfig> {
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`config file not found: ${path}`);

    let parsed: unknown;
    try {
        parsed = await file.json();
    } catch (error) {
        return fail(path, error instanceof Error ? error.message : "not valid json");
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        return fail(path, "expected a json object");
    const raw = parsed as Record<string, unknown>;

    for (const key of Object.keys(raw))
        if (key !== "homes" && key !== "model" && key !== "style") fail(path, `unknown key ${key}`);

    const homes = raw.homes;
    if (
        homes !== undefined &&
        (!Array.isArray(homes) || homes.some((home) => typeof home !== "string"))
    ) {
        return fail(path, "homes must be an array of paths");
    }

    const model = raw.model;
    const fields = model === undefined ? {} : objectAt(path, model, "model");
    for (const [key, value] of Object.entries(fields)) {
        const kind = MODEL_FIELDS[key as keyof typeof MODEL_FIELDS];
        if (!kind) fail(path, `unknown model key ${key}`);
        if (value !== undefined && typeof value !== kind)
            fail(path, `model.${key} must be a ${kind}`);
    }

    return {
        homes: (homes as string[] | undefined)?.map((home) => homeAt(path, home)),
        model: fields as Partial<ModelConfig>,
        style: raw.style as string | StyleParts | undefined,
    };
}

/** Every config file there is, in the order one is looked for. */
export async function configPaths(cwd: string, home: string): Promise<string[]> {
    const candidates = [
        join(cwd, FILE_NAME),
        join(home, FILE_NAME),
        join(defaultHome(), FILE_NAME),
    ];
    const found: string[] = [];
    for (const candidate of candidates)
        if (await Bun.file(candidate).exists()) found.push(candidate);
    return found;
}

export async function loadConfig(
    options: {
        path?: string;
        homeArgs?: string[];
        cwd?: string;
        env?: Record<string, string | undefined>;
    } = {},
): Promise<Config> {
    const env = options.env ?? process.env;
    const cwd = options.cwd ?? process.cwd();
    const fromArgs = options.homeArgs ?? [];
    const path = options.path ?? (await configPaths(cwd, resolveHomes(fromArgs, env)[0]))[0];

    if (!path) {
        return {
            homes: resolveHomes(fromArgs, env),
            model: resolveConfig(env),
            style: await resolveStyle(undefined, { dir: cwd, env }),
        };
    }

    const file = await loadConfigFile(path);
    return {
        homes: fromArgs.length > 0 ? fromArgs : (file.homes ?? [defaultHome()]),
        model: withDefaults(file.model ?? {}),
        // A path in a config file is relative to that file rather than to wherever jeng
        // happened to be launched from, which is what every other path in one does.
        style: await resolveStyle(file.style, { dir: dirname(path), env }),
        path,
    };
}
