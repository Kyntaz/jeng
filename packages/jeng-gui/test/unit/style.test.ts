import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { DEFAULT_STYLE, STYLES, type Style, type StyleName } from "@jeng/core";
import { contrast, unreadable } from "../../src/main/contrast";
import { serve } from "../../src/main/server";
import { roots } from "../../src/main/style";

const THEME = await Bun.file(join(import.meta.dir, "..", "..", "src", "view", "theme.css")).text();

const named = Object.keys(STYLES) as StyleName[];

/** What the `:root` block in theme.css declares, read as the tokens it is a list of. */
function declared(css: string): Record<string, string> {
    const start = css.indexOf(":root {");
    const block = css.slice(start, css.indexOf("}", start));
    return Object.fromEntries(
        [...block.matchAll(/--jeng-([a-z-]+):\s*([^;]+);/g)].map(([, token, value]) => [
            token,
            value.trim(),
        ]),
    );
}

describe("the style a window is served", () => {
    test("is written into the stylesheet, one custom property per token", () => {
        expect(roots(STYLES["colorful-light"])).toContain("--jeng-paper: #fffde8;");
    });

    test("points the accent at learn, so the window's own mode takes it from there", () => {
        expect(roots(STYLES[DEFAULT_STYLE])).toContain("--jeng-accent: var(--jeng-learn-accent);");
    });

    test("reaches the page through the stylesheet rather than through the bridge", async () => {
        const site = serve(() => STYLES["modern-light"]);
        try {
            const sheet = await fetch(`${site.url}theme.css`).then((reply) => reply.text());

            expect(sheet).toContain(`--jeng-paper: ${STYLES["modern-light"].gui.paper};`);
        } finally {
            site.stop();
        }
    });

    test("follows a config swap, because the picker can change which style is in force", async () => {
        let worn = STYLES["modern-light"];
        const site = serve(() => worn);
        try {
            await fetch(`${site.url}theme.css`).then((reply) => reply.text());
            worn = STYLES["colorful-dark"];

            const sheet = await fetch(`${site.url}theme.css`).then((reply) => reply.text());

            expect(sheet).toContain(`--jeng-paper: ${STYLES["colorful-dark"].gui.paper};`);
        } finally {
            site.stop();
        }
    });

    test("reaches a gadget as well, since it is served the same stylesheet", async () => {
        const site = serve(() => STYLES["colorful-light"]);
        try {
            const sheet = await fetch(`${site.url}gadget.css`).then((reply) => reply.text());

            expect(sheet).toContain("--jeng-radius-card: 0px;");
        } finally {
            site.stop();
        }
    });
});

describe("the stylesheet's own :root", () => {
    test("is the default style, token for token, so a page that loaded it alone still works", () => {
        const written = declared(THEME);
        // The three accents and the tint are the window's own rather than a style's, so
        // they are the only names here that no style token accounts for.
        const itsOwn = ["accent", "accent-tint", "accent-ink", "tint"];

        expect(
            Object.fromEntries(
                Object.entries(written).filter(([token]) => !itsOwn.includes(token)),
            ),
        ).toEqual(STYLES[DEFAULT_STYLE].gui);
    });
});

describe("a style", () => {
    test("gives the window both a reading face and a code face", () => {
        const style: Style = STYLES[DEFAULT_STYLE];

        expect({ serif: style.gui.serif !== "", mono: style.gui.mono !== "" }).toEqual({
            serif: true,
            mono: true,
        });
    });

    test("gives the terminal no fonts and no roundness, because it has neither", () => {
        expect(
            Object.keys(STYLES[DEFAULT_STYLE].tui).filter((token) => token.startsWith("radius")),
        ).toEqual([]);
    });
});

describe("contrast", () => {
    test("counts black against white as the most it can be", () => {
        expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    });

    test("does not care which way round the two colours are named", () => {
        expect(contrast("#ffffff", "#000000")).toBe(contrast("#000000", "#ffffff"));
    });

    test("treats a colour it cannot read as unreadable rather than passing it", () => {
        expect(contrast("not a colour", "#ffffff")).toBe(contrast("#000000", "#ffffff"));
    });
});

/**
 * Every style has to be readable, not just the one a jeng is wearing by default.
 *
 * A palette that looks right in a screenshot can still put a thought at 2:1 against the
 * desk, and the five styles nobody is looking at are exactly where that survives — so each
 * is held to the pairs the stylesheet actually draws, and a failure names the pair rather
 * than the style. Each style is also photographed in `pictures.test.tsx`, which is what
 * catches a style that passes every ratio and still reads as a mess.
 */
describe("every builtin style is readable", () => {
    for (const name of named) {
        test(name, () => {
            expect(unreadable(STYLES[name])).toEqual([]);
        });
    }
});
