import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ModelConfig } from "./model";

export interface Config {
    homes: string[];
    model: ModelConfig;
}

interface FileConfig {
    homes?: string[];
    model?: Partial<ModelConfig>;
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

export function resolveHomes(
    homeArgs: string[] = [],
    env: Record<string, string | undefined> = process.env,
): string[] {
    if (homeArgs.length > 0) return homeArgs;
    if (env.JENG_HOME) return env.JENG_HOME.split(";").filter(Boolean);
    return [defaultHome()];
}

export function resolveConfig(env: Record<string, string | undefined> = process.env): ModelConfig {
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
        if (key !== "homes" && key !== "model") fail(path, `unknown key ${key}`);

    const homes = raw.homes;
    if (
        homes !== undefined &&
        (!Array.isArray(homes) || homes.some((home) => typeof home !== "string"))
    ) {
        return fail(path, "homes must be an array of paths");
    }

    const model = raw.model;
    if (
        model !== undefined &&
        (typeof model !== "object" || model === null || Array.isArray(model))
    ) {
        return fail(path, "model must be an object");
    }

    const fields = (model ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(fields)) {
        const kind = MODEL_FIELDS[key as keyof typeof MODEL_FIELDS];
        if (!kind) fail(path, `unknown model key ${key}`);
        if (value !== undefined && typeof value !== kind)
            fail(path, `model.${key} must be a ${kind}`);
    }

    return {
        homes: (homes as string[] | undefined)?.map((home) =>
            home === "~"
                ? fail(
                      path,
                      'home "~" is your entire home folder. Use "~/.jeng" or a folder inside it.',
                  )
                : home.startsWith("~/")
                  ? join(homedir(), home.slice(1))
                  : isAbsolute(home)
                    ? home
                    : resolve(dirname(path), home),
        ),
        model: fields as Partial<ModelConfig>,
    };
}

async function findConfig(cwd: string, home: string): Promise<string | undefined> {
    const candidates = [
        join(cwd, FILE_NAME),
        join(home, FILE_NAME),
        join(defaultHome(), FILE_NAME),
    ];
    for (const candidate of candidates) if (await Bun.file(candidate).exists()) return candidate;
    return undefined;
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
    const path = options.path ?? (await findConfig(cwd, resolveHomes(fromArgs, env)[0]));

    if (!path) return { homes: resolveHomes(fromArgs, env), model: resolveConfig(env) };

    const file = await loadConfigFile(path);
    return {
        homes: fromArgs.length > 0 ? fromArgs : (file.homes ?? [defaultHome()]),
        model: withDefaults(file.model ?? {}),
    };
}
