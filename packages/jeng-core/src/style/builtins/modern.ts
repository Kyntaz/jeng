import type { Style } from "../tokens";

/**
 * The window as it already looks: a desk of dark taupe with a slip of cream paper lying
 * on it, and a speaker told apart by the colour its slip is printed in.
 *
 * Wada's 57th, Taupe Brown over Slate Color. The two are a serious pair -- a plum-brown
 * and a blue so dark it is nearly black -- and the whole style is that pair held to a
 * narrow range. It is the only style that casts a shadow, because paper lying on a desk
 * is what casts one.
 */
export const MODERN_DARK: Style = {
    gui: {
        paper: "#45232f",
        surface: "#fdf7ee",
        text: "#3a1f28",
        muted: "#7a5765",
        dim: "#c9a8b4",
        border: "#7a4456",

        "learn-accent": "#d9a441",
        "learn-accent-tint": "#f8ebd4",
        "learn-accent-ink": "#8a6410",
        "work-accent": "#5fb3d4",
        "work-accent-tint": "#d7e8f2",
        "work-accent-ink": "#435175",
        "on-accent": "#2b1420",

        user: "#b23a4a",
        "user-tint": "#f8cdc4",
        jeng: "#7a4456",
        "jeng-tint": "#f8ebd4",
        "think-tint": "#e7dbd8",
        danger: "#7a1230",
        "danger-tint": "#f6d6dc",

        "radius-card": "4px",
        "radius-control": "3px",
        "radius-field": "3px",
        shadow: "6px 6px 0 rgb(217 164 65 / 25%)",

        serif: '"Times New Roman", Times, "Liberation Serif", Georgia, serif',
        mono: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        size: "16px",
        grain: "rgb(217 164 65 / 4%)",

        "code-comment": "#7d5d67",
        "code-keyword": "#a02c46",
        "code-string": "#1f6f66",
        "code-number": "#8a6a1f",
        "code-title": "#7a4456",
        "code-type": "#6a3352",
        "code-attr": "#a8543a",
        "code-add": "#1f6f66",
        "code-delete": "#a02c46",
    },

    tui: {
        learn: "#d9a441",
        work: "#5fb3d4",
        "learn-tint": "#3a3018",
        "work-tint": "#1d3340",

        user: "#98c379",
        muted: "#606070",
        think: "#6c6c80",
        failure: "#e06c75",
        approval: "#d19a66",
        selection: "#3f5b73",

        "code-comment": "#6c6c80",
        "code-keyword": "#c678dd",
        "code-string": "#98c379",
        "code-number": "#d19a66",
        "code-title": "#61afef",
        "code-type": "#c678dd",
        "code-attr": "#d19a66",
        "code-add": "#98c379",
        "code-delete": "#e06c75",
        "code-heading": "#29bdad",
        "code-link": "#5fb3d4",
        "code-list": "#d19a66",
    },
};

/**
 * The same serious pair on a light desk: the slate becomes the page and the taupe becomes
 * what is printed on it, which is the mirror of the dark half rather than a new palette.
 *
 * Wada's 140th, Golden Yellow over Antwarp Blue over Slate Color. Golden yellow is the
 * one saturated colour in it and it goes to learn alone.
 */
export const MODERN_LIGHT: Style = {
    gui: {
        paper: "#dfe6ec",
        surface: "#fbfcfd",
        text: "#1f2a33",
        muted: "#5a6b78",
        dim: "#54646f",
        border: "#b6c6d2",

        "learn-accent": "#8f5708",
        "learn-accent-tint": "#fbeedb",
        "learn-accent-ink": "#7a4a06",
        "work-accent": "#006a80",
        "work-accent-tint": "#ddf0f4",
        "work-accent-ink": "#00505f",
        "on-accent": "#ffffff",

        user: "#a8323f",
        "user-tint": "#fbe3e5",
        jeng: "#1f2a33",
        "jeng-tint": "#f4f7fa",
        "think-tint": "#e9eff4",
        danger: "#9c1f38",
        "danger-tint": "#fbdfe4",

        "radius-card": "4px",
        "radius-control": "3px",
        "radius-field": "3px",
        shadow: "0 1px 2px rgb(31 42 51 / 8%), 0 6px 16px rgb(31 42 51 / 7%)",

        serif: '"Times New Roman", Times, "Liberation Serif", Georgia, serif',
        mono: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        size: "16px",
        grain: "rgb(31 42 51 / 3%)",

        "code-comment": "#5c6b77",
        "code-keyword": "#a01f38",
        "code-string": "#0a6a5e",
        "code-number": "#8a5a10",
        "code-title": "#1f2a33",
        "code-type": "#5b3a6e",
        "code-attr": "#a8543a",
        "code-add": "#0a6a5e",
        "code-delete": "#a01f38",
    },

    tui: {
        learn: "#8f5708",
        work: "#006a80",
        "learn-tint": "#fbeedb",
        "work-tint": "#ddf0f4",

        user: "#1f7a4d",
        muted: "#5a6b78",
        think: "#7a8a97",
        failure: "#9c1f38",
        approval: "#8a5a10",
        selection: "#c3d3de",

        "code-comment": "#5c6b77",
        "code-keyword": "#a01f38",
        "code-string": "#0a6a5e",
        "code-number": "#8a5a10",
        "code-title": "#1f2a33",
        "code-type": "#5b3a6e",
        "code-attr": "#a8543a",
        "code-add": "#0a6a5e",
        "code-delete": "#a01f38",
        "code-heading": "#007d95",
        "code-link": "#007d95",
        "code-list": "#8a5a10",
    },
};
