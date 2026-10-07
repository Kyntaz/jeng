import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_STYLE, STYLES, type Style, type StyleParts } from "../../src/style";
import { resolveStyle } from "../../src/style/resolve";

async function scratch(written: unknown): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-style-"));
    await Bun.write(join(dir, "style.json"), JSON.stringify(written));
    return dir;
}

/** What `resolveStyle` reads directly, so a test says where the style came from rather
 *  than going through a config file that would only be one more way of spelling it.
 *
 *  `written` is `unknown` on purpose: a style arrives as parsed json, so the checks being
 *  tested here are the ones between the file and the type rather than the type itself. */
const load = (written?: unknown, dir = ".", env: Record<string, string> = {}) =>
    resolveStyle(written as string | StyleParts | undefined, { dir, env });

describe("style", () => {
    test("falls back to the default style when nothing is configured", async () => {
        expect(await load()).toEqual(STYLES[DEFAULT_STYLE]);
    });

    test("takes a builtin by name", async () => {
        expect(await load("modern-light")).toEqual(STYLES["modern-light"]);
    });

    test("takes a style inlined in the config, token for token", async () => {
        const style = await load({ gui: { paper: "#101010" }, tui: { muted: "#202020" } });

        expect({
            paper: style.gui.paper,
            muted: style.tui.muted,
            border: style.gui.border,
        }).toEqual({
            paper: "#101010",
            muted: "#202020",
            border: STYLES[DEFAULT_STYLE].gui.border,
        });
    });

    test("reads a style file, resolving a relative path against the folder it was named in", async () => {
        const dir = await scratch({ tui: { muted: "#333333" } });

        expect((await load("./style.json", dir)).tui.muted).toBe("#333333");
        await rm(dir, { recursive: true, force: true });
    });

    test("takes the style from JENG_STYLE when the config says nothing about one", async () => {
        expect(await load(undefined, ".", { JENG_STYLE: "colorful-dark" })).toEqual(
            STYLES["colorful-dark"],
        );
    });

    test("lets a config's own style win over JENG_STYLE, unlike the model it sits beside", async () => {
        expect(await load("simple-light", ".", { JENG_STYLE: "colorful-dark" })).toEqual(
            STYLES["simple-light"],
        );
    });

    test("throws on a token the window has no variable for", async () => {
        expect(load({ gui: { papper: "#000" } })).rejects.toThrow("unknown gui token papper");
    });

    test("throws on a token the terminal has no name for", async () => {
        expect(load({ tui: { papper: "#000" } })).rejects.toThrow("unknown tui token papper");
    });

    test("throws on a token that is not a string", async () => {
        expect(load({ gui: { paper: 16 } })).rejects.toThrow("gui.paper must be a string");
    });

    test("throws on a name that is neither a builtin nor a file that is there", async () => {
        expect(load("modernish")).rejects.toThrow("style file not found");
    });

    test("throws rather than falling back when a named style cannot be read", async () => {
        const dir = await scratch("{ not json");

        expect(load("./style.json", dir)).rejects.toThrow("invalid style at");
        await rm(dir, { recursive: true, force: true });
    });

    test("throws on a key that belongs to neither frontend", async () => {
        expect(load({ terminal: { muted: "#000" } })).rejects.toThrow("unknown key terminal");
    });
});

describe("the six builtin styles", () => {
    const named = Object.keys(STYLES) as (keyof typeof STYLES)[];

    test("are all six of them, and the default is one of them", () => {
        expect({ count: named.length, default: named.includes(DEFAULT_STYLE) }).toEqual({
            count: 6,
            default: true,
        });
    });

    test("each fill in every token on both sides, so no one is half a style", () => {
        const holes = named.filter((name) => {
            const style: Style = STYLES[name];
            return [...Object.values(style.gui), ...Object.values(style.tui)].some(
                (token) => !token,
            );
        });

        expect(holes).toEqual([]);
    });

    test("each pick a distinct paper, so no two look alike at a glance", () => {
        const papers = named.map((name) => STYLES[name].gui.paper);

        expect(new Set(papers).size).toBe(named.length);
    });
});
