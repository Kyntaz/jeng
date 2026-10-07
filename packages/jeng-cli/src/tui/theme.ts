import type { Choice, Mode, Style } from "@jeng/core";
import { DEFAULT_STYLE, STYLES } from "@jeng/core";
import type { Entry } from "@jeng/view";
import { SyntaxStyle } from "@opentui/core";

/**
 * The terminal half of the style in force.
 *
 * These are `let` rather than `const` and are filled in once by `dress`, before the first
 * frame is drawn. Every one of them is read at draw time from a different component, and
 * a module binding is live, so this is the one place the style is put and the seven places
 * it is read -- rather than threading a style through every component to reach a border.
 */

// A mode is told apart by its colour, so the word and the boxes around it have to
// agree: gold is the agent that grows, blue the one that has already grown.
export let MODE_COLOR: Record<Mode, string> = { learn: "", work: "" };

// A wash of the mode's own colour behind the prompt, because the transcript scrolls
// under that box and a border showing through it reads as a broken one.
export let MODE_TINT: Record<Mode, string> = { learn: "", work: "" };

// The user is never either mode, so they get the one colour that is neither.
export let USER = "";

export let BORDER = "";

// What the mouse is holding, which is neither an answer nor chrome. Nothing in
// opentui highlights a selection on its own, so without this the drag that copies
// cannot be seen.
export let SELECTION = "";

export let MUTED = "";

export let FAILURE = "";

export let APPROVAL = "";

// Code, diffs and markdown are highlighted from this one style, and a markdown or
// code block that is handed none of it draws nothing at all rather than drawing
// itself plainly. One style for the whole UI, so nothing has to be created twice.
export let SYNTAX = SyntaxStyle.create();

// The output of an action is drawn in the same muted gray as the chrome, so the
// call it answers rather than its answer is what the eye lands on. A call itself
// wears its mode's colour, so the box around it is what tells it from Jeng's words.
export let COLORS: Partial<Record<Entry["kind"], string | undefined>> = {};

/** Put a style on the terminal, before anything is drawn. */
export function dress(worn: Style): void {
    const { tui } = worn;

    MODE_COLOR = { learn: tui.learn, work: tui.work };
    MODE_TINT = { learn: tui["learn-tint"], work: tui["work-tint"] };
    USER = tui.user;
    BORDER = tui.learn;
    SELECTION = tui.selection;
    MUTED = tui.muted;
    FAILURE = tui.failure;
    APPROVAL = tui.approval;
    COLORS = {
        user: tui.user,
        jeng: undefined,
        think: tui.think,
        output: tui.muted,
        failure: tui.failure,
        approval: tui.approval,
        view: undefined,
        error: tui.failure,
    };
    SYNTAX = SyntaxStyle.fromTheme([
        { scope: ["markup.heading"], style: { foreground: tui["code-heading"], bold: true } },
        { scope: ["markup.list"], style: { foreground: tui["code-list"] } },
        { scope: ["markup.raw"], style: { foreground: tui["code-string"] } },
        { scope: ["markup.inserted"], style: { foreground: tui["code-add"] } },
        { scope: ["markup.deleted"], style: { foreground: tui["code-delete"] } },
        { scope: ["markup.link"], style: { foreground: tui["code-link"], underline: true } },
        { scope: ["keyword", "storage"], style: { foreground: tui["code-keyword"] } },
        { scope: ["type"], style: { foreground: tui["code-type"] } },
        { scope: ["string"], style: { foreground: tui["code-string"] } },
        { scope: ["comment"], style: { foreground: tui["code-comment"], italic: true } },
        { scope: ["number", "constant"], style: { foreground: tui["code-number"] } },
        { scope: ["function", "constructor"], style: { foreground: tui["code-title"] } },
    ]);
}

dress(STYLES[DEFAULT_STYLE]);

export type Owner = "user" | "jeng" | "tool";

// A select has no height of its own, so it is given one from what it holds, capped
// so a long list scrolls inside the panel instead of pushing the prompt off screen.
const CHOICE_HEIGHT = 10;

export function choiceList(options: Choice[]) {
    const described = options.some((option) => option.description);
    return {
        showDescription: described,
        height: Math.max(1, Math.min(CHOICE_HEIGHT, options.length * (described ? 2 : 1))),
        options: options.map((option) => ({
            name: option.name,
            description: option.description ?? "",
        })),
    };
}

// Jeng's thinking and words belong in its box, an action in a box of its own, and
// an error in neither speaker's.
export function owner(entry: Entry): Owner | undefined {
    switch (entry.kind) {
        case "user":
            return "user";
        case "jeng":
        case "think":
        case "view":
            return "jeng";
        case "tool":
        case "output":
        case "failure":
        case "approval":
            return "tool";
        case "error":
            return undefined;
    }
}

export function color(owner: Owner, mode: Mode = "learn"): string {
    return owner === "user" ? USER : MODE_COLOR[mode];
}
