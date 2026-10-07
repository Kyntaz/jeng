import type { Style } from "../tokens";

/**
 * One hue and almost none of it.
 *
 * Sanzo Wada's 69th combination, Warm Gray over Black. A near-neutral ground with two
 * colours pulled far enough apart to be told apart at a glance, and nothing else
 * invented: every token is that gray a step up or down, so nothing on screen can shout.
 *
 * Learn stays gold and work stays blue, because this is what a jeng with no style chosen
 * looks like and the two are how the mode is read at all. They are dark enough to take
 * the block's own paper-coloured type, so a chip reads without a border.
 */
export const SIMPLE_DARK: Style = {
    gui: {
        paper: "#000000",
        surface: "#0e100f",
        text: "#9cb29e",
        muted: "#7e8f81",
        dim: "#79877c",
        border: "#252b26",

        "learn-accent": "#c6b800",
        "learn-accent-tint": "#1f1d05",
        "learn-accent-ink": "#a09400",
        "work-accent": "#7aa0c2",
        "work-accent-tint": "#0d141b",
        "work-accent-ink": "#5f86a8",
        "on-accent": "#000000",

        user: "#8fae8a",
        "user-tint": "#101a10",
        jeng: "#9cb29e",
        "jeng-tint": "#0e100f",
        "think-tint": "#121513",
        danger: "#c97060",
        "danger-tint": "#2a1512",

        "radius-card": "2px",
        "radius-control": "2px",
        "radius-field": "2px",
        shadow: "none",

        serif: 'system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        mono: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        size: "15px",
        grain: "rgb(156 178 158 / 3%)",

        "code-comment": "#7e8f81",
        "code-keyword": "#c6b800",
        "code-string": "#8fae8a",
        "code-number": "#b98a6b",
        "code-title": "#9cb29e",
        "code-type": "#7f9e8a",
        "code-attr": "#b98a6b",
        "code-add": "#63a063",
        "code-delete": "#b06d66",
    },

    tui: {
        learn: "#c6b800",
        work: "#7aa0c2",
        "learn-tint": "#1f1d05",
        "work-tint": "#0d141b",

        user: "#8fae8a",
        muted: "#7e8f81",
        think: "#6f7f73",
        failure: "#c97060",
        approval: "#b98a6b",
        selection: "#26302a",

        "code-comment": "#7e8f81",
        "code-keyword": "#c6b800",
        "code-string": "#8fae8a",
        "code-number": "#b98a6b",
        "code-title": "#9cb29e",
        "code-type": "#7f9e8a",
        "code-attr": "#b98a6b",
        "code-add": "#63a063",
        "code-delete": "#b06d66",
        "code-heading": "#7aa0c2",
        "code-link": "#7aa0c2",
        "code-list": "#b98a6b",
    },
};

/**
 * The same one hue, on paper instead of on black.
 *
 * Wada's 11th, Ivory Buff over Mineral Gray. The gray is lifted all the way to almost
 * white for the page, so the page is not a colour and everything printed on it is. The
 * two accents go dark rather than pale here, which is the whole difference between the
 * two halves of this style: the blocks are still solid, and still take type.
 */
export const SIMPLE_LIGHT: Style = {
    gui: {
        paper: "#e8ede8",
        surface: "#ffffff",
        text: "#26302a",
        muted: "#5d6b5f",
        dim: "#55635a",
        border: "#d3ddd4",

        "learn-accent": "#6f6700",
        "learn-accent-tint": "#f5f2d8",
        "learn-accent-ink": "#5c5600",
        "work-accent": "#3f6a90",
        "work-accent-tint": "#e4edf4",
        "work-accent-ink": "#2f5878",
        "on-accent": "#ffffff",

        user: "#3f6b3f",
        "user-tint": "#e2efe2",
        jeng: "#26302a",
        "jeng-tint": "#ffffff",
        "think-tint": "#eef2ef",
        danger: "#a63b28",
        "danger-tint": "#f7e3de",

        "radius-card": "2px",
        "radius-control": "2px",
        "radius-field": "2px",
        shadow: "none",

        serif: 'system-ui, "Segoe UI", Helvetica, Arial, sans-serif',
        mono: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        size: "15px",
        grain: "rgb(38 48 42 / 3%)",

        "code-comment": "#5d6b5f",
        "code-keyword": "#7a7100",
        "code-string": "#3f7040",
        "code-number": "#9a5a30",
        "code-title": "#26302a",
        "code-type": "#3f6a50",
        "code-attr": "#9a5a30",
        "code-add": "#46690f",
        "code-delete": "#a63b28",
    },

    tui: {
        learn: "#6f6700",
        work: "#3f6a90",
        "learn-tint": "#f5f2d8",
        "work-tint": "#e4edf4",

        user: "#3f6b3f",
        muted: "#5d6b5f",
        think: "#7a877d",
        failure: "#a63b28",
        approval: "#9a5a30",
        selection: "#d3ddd4",

        "code-comment": "#5d6b5f",
        "code-keyword": "#7a7100",
        "code-string": "#3f7040",
        "code-number": "#9a5a30",
        "code-title": "#26302a",
        "code-type": "#3f6a50",
        "code-attr": "#9a5a30",
        "code-add": "#46690f",
        "code-delete": "#a63b28",
        "code-heading": "#3f6a90",
        "code-link": "#3f6a90",
        "code-list": "#9a5a30",
    },
};
