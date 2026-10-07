/**
 * What a style is: one flat bag of tokens per frontend, named the way that frontend
 * already names them. Nothing here is a colour or a length -- only which tokens exist,
 * so a style that spells one wrong is refused rather than silently ignored.
 */

/** What the window draws in. `grain` and `size` are there because the desk and the body
 *  text are not the paper, so neither takes a token that only makes sense on the paper;
 *  `on-accent` is there because a mode is drawn as a solid block of its own colour, and
 *  a colour can only carry type that was picked against it. */
export const GUI_TOKENS = [
    "paper",
    "surface",
    "text",
    "muted",
    "dim",
    "border",
    "learn-accent",
    "learn-accent-tint",
    "learn-accent-ink",
    "work-accent",
    "work-accent-tint",
    "work-accent-ink",
    "on-accent",
    "user",
    "user-tint",
    "jeng",
    "jeng-tint",
    "think-tint",
    "danger",
    "danger-tint",
    "radius-card",
    "radius-control",
    "radius-field",
    "shadow",
    "serif",
    "mono",
    "size",
    "grain",
    "code-comment",
    "code-keyword",
    "code-string",
    "code-number",
    "code-title",
    "code-type",
    "code-attr",
    "code-add",
    "code-delete",
] as const;

/** What the terminal draws in. No roundness and no fonts, because a terminal has neither;
 *  `selection` is here because nothing in opentui highlights a drag on its own. */
export const TUI_TOKENS = [
    "learn",
    "work",
    "learn-tint",
    "work-tint",
    "user",
    "muted",
    "think",
    "failure",
    "approval",
    "selection",
    "code-comment",
    "code-keyword",
    "code-string",
    "code-number",
    "code-title",
    "code-type",
    "code-attr",
    "code-add",
    "code-delete",
    "code-heading",
    "code-link",
    "code-list",
] as const;

export type GuiToken = (typeof GUI_TOKENS)[number];
export type TuiToken = (typeof TUI_TOKENS)[number];

export interface Style {
    gui: Record<GuiToken, string>;
    tui: Record<TuiToken, string>;
}

/** What a style file or an inlined style is written as: every token optional, since one
 *  that leaves some out falls back to the default style's value for those. */
export interface StyleParts {
    gui?: Partial<Record<GuiToken, string>>;
    tui?: Partial<Record<TuiToken, string>>;
}
