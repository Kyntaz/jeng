import type { Style } from "../tokens";

/**
 * Loud on purpose, and square.
 *
 * Wada's 141st, Orange over Yellow Green over Dark Tyrian Blue. None of the three will
 * sit next to another without a fight, which is the point: every token here is one of
 * those three or black, nothing is a tint of anything, and the corners are all right
 * angles. It is the only style with no serif at all.
 */
export const COLORFUL_DARK: Style = {
    gui: {
        paper: "#0d2b52",
        surface: "#ffffff",
        text: "#000000",
        muted: "#5c6470",
        dim: "#a8b0bd",
        border: "#0d2b52",

        "learn-accent": "#ff6a2a",
        "learn-accent-tint": "#ffe4d6",
        "learn-accent-ink": "#d64300",
        "work-accent": "#a6ff47",
        "work-accent-tint": "#ecffd6",
        "work-accent-ink": "#5f8f1c",
        "on-accent": "#000000",

        user: "#c74300",
        "user-tint": "#ffe4d6",
        jeng: "#000000",
        "jeng-tint": "#f4ff47",
        "think-tint": "#ffebd6",
        danger: "#1b5e20",
        "danger-tint": "#e4f6dc",

        "radius-card": "0px",
        "radius-control": "0px",
        "radius-field": "0px",
        shadow: "6px 6px 0 #ff5200",

        serif: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        mono: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        size: "16px",
        grain: "rgb(255 82 0 / 6%)",

        "code-comment": "#626a74",
        "code-keyword": "#d60036",
        "code-string": "#46690f",
        "code-number": "#0d2b52",
        "code-title": "#c74300",
        "code-type": "#2f52b8",
        "code-attr": "#a34a00",
        "code-add": "#46690f",
        "code-delete": "#b83300",
    },

    tui: {
        learn: "#ff5200",
        work: "#a6ff47",
        "learn-tint": "#3d1000",
        "work-tint": "#2b3d10",

        user: "#ffab00",
        muted: "#7a8290",
        think: "#5c6470",
        failure: "#ff3b3b",
        approval: "#ffab00",
        selection: "#1a4478",

        "code-comment": "#626a74",
        "code-keyword": "#ff5200",
        "code-string": "#a6ff47",
        "code-number": "#7aa0ff",
        "code-title": "#ffab00",
        "code-type": "#2f52b8",
        "code-attr": "#ff8c00",
        "code-add": "#a6ff47",
        "code-delete": "#ff3b3b",
        "code-heading": "#a6ff47",
        "code-link": "#7aa0ff",
        "code-list": "#ffab00",
    },
};

/**
 * The same three on white, which is where a saturated palette has the least trouble.
 *
 * Wada's 154th, Carmine over Yellow over Blue. Yellow is unreadable as type and as a
 * wash, so it is only ever a fill -- a chip, a block -- and never anything printed on it.
 */
export const COLORFUL_LIGHT: Style = {
    gui: {
        paper: "#fffde8",
        surface: "#ffffff",
        text: "#111111",
        muted: "#5f5f5f",
        dim: "#5c5c5c",
        border: "#111111",

        "learn-accent": "#d60036",
        "learn-accent-tint": "#ffe0e7",
        "learn-accent-ink": "#a30029",
        "work-accent": "#0957c4",
        "work-accent-tint": "#dceaff",
        "work-accent-ink": "#074a9e",
        "on-accent": "#ffff00",

        user: "#8c6510",
        "user-tint": "#fbeed8",
        jeng: "#111111",
        "jeng-tint": "#fff59e",
        "think-tint": "#fff3c4",
        danger: "#9e0033",
        "danger-tint": "#fbdfe4",

        "radius-card": "0px",
        "radius-control": "0px",
        "radius-field": "0px",
        shadow: "6px 6px 0 #d60036",

        serif: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        mono: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace',
        size: "16px",
        grain: "rgb(214 0 54 / 5%)",

        "code-comment": "#5a5a5a",
        "code-keyword": "#d60036",
        "code-string": "#074a9e",
        "code-number": "#7a4a00",
        "code-title": "#111111",
        "code-type": "#5a2fa0",
        "code-attr": "#a34a00",
        "code-add": "#074a9e",
        "code-delete": "#d60036",
    },

    tui: {
        learn: "#d60036",
        work: "#0d75ff",
        "learn-tint": "#ffe0e7",
        "work-tint": "#dceaff",

        user: "#c74300",
        muted: "#5f5f5f",
        think: "#7a7a7a",
        failure: "#0d75ff",
        approval: "#a34a00",
        selection: "#fff59e",

        "code-comment": "#5a5a5a",
        "code-keyword": "#d60036",
        "code-string": "#074a9e",
        "code-number": "#7a4a00",
        "code-title": "#111111",
        "code-type": "#5a2fa0",
        "code-attr": "#a34a00",
        "code-add": "#074a9e",
        "code-delete": "#d60036",
        "code-heading": "#0d75ff",
        "code-link": "#0d75ff",
        "code-list": "#a34a00",
    },
};
