import type { GuiToken, Style } from "@jeng/core";

/**
 * How legible a style is, decided rather than looked at.
 *
 * Every pair here is one the stylesheet actually draws: a token against the ground it is
 * painted on, and nothing else. A pair that is not drawn does not belong in the list, which
 * is why there is no "text on paper" — text is never printed straight onto the desk.
 *
 * A colour can only be dimmed against one ground, so the list is split the way the
 * stylesheet is: `dim` is drawn on the desk and nowhere else, and `muted` is drawn on the
 * paper and never on the desk. That is what lets one near-neutral pair of tokens serve a
 * desk and a surface that are opposites.
 */

/** 4.5 for text of any size, 3 for a rule or an edge, which only has to be findable. */
const TEXT = 4.5;
const EDGE = 3;

type Pair = [GuiToken, GuiToken, number];

const PAIRS: Pair[] = [
    // Jeng's words, the user's question and the reason bar, all on a slip.
    ["text", "surface", TEXT],
    ["text", "jeng-tint", TEXT],
    ["text", "user-tint", TEXT],

    // What is written quietly: the chrome, the placeholder, a thought.
    ["muted", "surface", TEXT],
    ["muted", "think-tint", TEXT],
    ["muted", "jeng-tint", TEXT],

    // The three things the desk shows directly: the AGENTS.md lines, the spinner and a note.
    ["dim", "paper", TEXT],

    // A mode: the chip and the send button, and the spinner on the desk.
    ["on-accent", "learn-accent", TEXT],
    ["on-accent", "work-accent", TEXT],
    ["learn-accent", "paper", TEXT],
    ["work-accent", "paper", TEXT],
    // A rule, a border, a dot, a hover: findable rather than readable.
    ["learn-accent-ink", "surface", EDGE],
    ["learn-accent-ink", "learn-accent-tint", EDGE],
    ["work-accent-ink", "surface", EDGE],
    ["work-accent-ink", "work-accent-tint", EDGE],

    // The two buttons that are an answer, and the reason a picker refused.
    ["user", "surface", TEXT],
    ["danger", "surface", TEXT],

    // A failure, printed in the danger colour on a wash of it.
    ["danger", "danger-tint", TEXT],

    // Code, which is a block of its own and cannot be re-coloured by what is behind it.
    ["code-comment", "surface", TEXT],
    ["code-keyword", "surface", TEXT],
    ["code-string", "surface", TEXT],
    ["code-number", "surface", TEXT],
    ["code-title", "surface", TEXT],
    ["code-type", "surface", TEXT],
    ["code-attr", "surface", TEXT],
    ["code-add", "surface", TEXT],
    ["code-delete", "surface", TEXT],
];

const channel = (value: number): number =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

/** Relative luminance, which is what WCAG contrast is measured in. An unparseable colour
 *  is treated as black rather than skipped, so a typo in a style fails the test rather than
 *  quietly passing it. */
export function luminance(colour: string): number {
    const hex = colour.trim().replace("#", "");
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    if (full.length !== 6 || !/^[0-9a-f]{6}$/i.test(full)) return 0;

    const [r, g, b] = [0, 2, 4].map((at) => channel(parseInt(full.slice(at, at + 2), 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fore: string, back: string): number {
    const [light, dark] = [luminance(fore), luminance(back)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
}

/** The pairs in one style that fall short, as `token on token: how far short`, so a
 *  failure says which pair to fix rather than that the style is dark. */
export function unreadable(style: Style): string[] {
    return PAIRS.flatMap(([fore, back, wanted]) => {
        const ratio = contrast(style.gui[fore], style.gui[back]);
        return ratio >= wanted ? [] : [`${fore} on ${back}: ${ratio.toFixed(2)} < ${wanted}`];
    });
}
