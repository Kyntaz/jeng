import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_STYLE, STYLES } from "@jeng/core";
import { dress, MODE_COLOR, MUTED, USER } from "../../../src/tui/theme";

/**
 * A style has to reach the terminal before anything is drawn, and the only proof is that
 * what the components read is the style's rather than what the module started with.
 *
 * These bindings are live, so every test puts the default back afterwards. Without that a
 * test would leave the next one looking at a style nobody chose.
 */
describe("dressing the terminal in a style", () => {
    afterEach(() => dress(STYLES[DEFAULT_STYLE]));

    test("puts the style's own colours on the two modes", () => {
        dress(STYLES["colorful-dark"]);

        expect({ ...MODE_COLOR }).toEqual({ learn: "#ff5200", work: "#a6ff47" });
    });

    test("gives the user a colour that is neither mode's", () => {
        dress(STYLES["colorful-light"]);

        expect(USER).toBe("#c74300");
    });

    test("moves the muted gray the chrome is drawn in", () => {
        dress(STYLES["colorful-dark"]);

        expect(MUTED).toBe("#7a8290");
    });

    test("puts back what the next run did not choose, so a style is the whole style", () => {
        dress(STYLES["colorful-dark"]);
        dress(STYLES["modern-light"]);

        expect(MUTED).toBe(STYLES["modern-light"].tui.muted);
    });

    test("leaves the terminal in the default style when nothing was chosen", () => {
        expect(MUTED).toBe(STYLES[DEFAULT_STYLE].tui.muted);
    });
});
