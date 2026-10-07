import { at } from "../at";
import { DEFAULT_STYLE, STYLES, type StyleName } from "./builtins";
import type { Style, StyleParts } from "./tokens";
import { GUI_TOKENS, TUI_TOKENS } from "./tokens";

/** `path` is what a reason is prefixed with, and an inlined style has no file, so it is
 *  named by the key it was written under rather than left without one. */
function fail(path: string, reason: string): never {
    throw new Error(`invalid style at ${path}: ${reason}`);
}

/** One half of a style, checked against the tokens that half actually has. A token the
 *  window has no variable for is a typo worth saying out loud, since a style that quietly
 *  loses half its colours looks like a style that was never read. */
function half(path: string, side: string, value: unknown, tokens: readonly string[]) {
    if (value === undefined) return {};
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return fail(path, `${side} must be an object`);
    const out: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!tokens.includes(key)) fail(path, `unknown ${side} token ${key}`);
        if (typeof raw !== "string") fail(path, `${side}.${key} must be a string`);
        out[key] = raw;
    }
    return out;
}

/** A style as it is written on disk or inlined in a config file. Only `gui` and `tui`,
 *  because a token that belongs to neither is a token the author meant for one of them. */
function parts(path: string, value: unknown): Required<StyleParts> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return fail(path, "expected a json object with gui and tui in it");
    const raw = value as Record<string, unknown>;
    for (const key of Object.keys(raw))
        if (key !== "gui" && key !== "tui") fail(path, `unknown key ${key}, expected gui or tui`);
    return {
        gui: half(path, "gui", raw.gui, GUI_TOKENS),
        tui: half(path, "tui", raw.tui, TUI_TOKENS),
    };
}

/** A token the style leaves out keeps the default's value, the same rule the model config
 *  follows: a style that sets one colour is a style, and not an incomplete document. */
function merged(written: Required<StyleParts>): Style {
    const fallback = STYLES[DEFAULT_STYLE];
    return {
        gui: { ...fallback.gui, ...written.gui },
        tui: { ...fallback.tui, ...written.tui },
    };
}

async function read(dir: string, written: string): Promise<Required<StyleParts>> {
    const path = at(dir, written);
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`style file not found: ${path}`);

    let parsed: unknown;
    try {
        parsed = await file.json();
    } catch (error) {
        return fail(path, error instanceof Error ? error.message : "not valid json");
    }
    return parts(path, parsed);
}

/** One name or one path, whichever it turned out to be. A name that is not one of the six
 *  is looked for as a file, so a typo says the file is not there rather than listing six
 *  names at someone who wanted a file called `work.json`. */
async function resolved(dir: string, source: string): Promise<Style> {
    const named: Style | undefined = STYLES[source as StyleName];
    if (named) return named;
    return merged(await read(dir, source));
}

/**
 * The one place a style is decided.
 *
 * A config file's own `style` is read first, then `JENG_STYLE`, then the default style --
 * so a config file that says nothing about style still lets a machine-wide `JENG_STYLE`
 * work. Every other key stops reading the environment once a config file is found; a
 * style is how something looks rather than which agent it is, so it is the exception.
 *
 * `dir` is what a path is resolved against: the config file's own folder for a config
 * file's `style`, and the working directory for the environment.
 */
export async function resolveStyle(
    from: string | StyleParts | undefined,
    options: { dir: string; env?: Record<string, string | undefined> } = { dir: "." },
): Promise<Style> {
    const env = options.env ?? process.env;

    if (from !== undefined && typeof from === "object") return merged(parts("the style", from));
    if (typeof from === "string") return await resolved(options.dir, from);

    const named = env.JENG_STYLE;
    if (named) return await resolved(options.dir, named);

    return STYLES[DEFAULT_STYLE];
}

export type { Style, StyleParts } from "./tokens";
export { GUI_TOKENS, TUI_TOKENS } from "./tokens";
