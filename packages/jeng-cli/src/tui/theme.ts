import type { Choice, Mode } from "@jeng/core";
import { SyntaxStyle } from "@opentui/core";
import type { Entry } from "./entries";

// A mode is told apart by its colour, so the word and the boxes around it have to
// agree: gold is the agent that grows, blue the one that has already grown.
export const MODE_COLOR = { learn: "#d9a441", work: "#5fb3d4" };

// A wash of the mode's own colour behind the prompt, because the transcript scrolls
// under that box and a border showing through it reads as a broken one.
export const MODE_TINT = { learn: "#3a3018", work: "#1d3340" };

// The user is never either mode, so they get the one colour that is neither.
export const USER = "#98c379";

// Chrome the user is looking at rather than something either of them said, so it
// keeps one colour of its own instead of taking the mode's.
export const BORDER = MODE_COLOR.learn;

// What the mouse is holding, which is neither an answer nor chrome. Nothing in
// opentui highlights a selection on its own, so without this the drag that copies
// cannot be seen.
export const SELECTION = "#3f5b73";

// An action keeps its owner's colour because it is its owner's, so the box around
// it rather than the colour of it is what tells an action from Jeng's words.
export type Owner = "user" | "jeng" | "tool";

export const MUTED = "#606070";

// Code, diffs and markdown are highlighted from this one style, and a markdown or
// code block that is handed none of it draws nothing at all rather than drawing
// itself plainly. One style for the whole UI, so nothing has to be created twice.
export const SYNTAX = SyntaxStyle.fromTheme([
    { scope: ["markup.heading"], style: { foreground: "cyan", bold: true } },
    { scope: ["markup.list"], style: { foreground: "#d19a66" } },
    { scope: ["markup.raw"], style: { foreground: "#98c379" } },
    { scope: ["markup.inserted"], style: { foreground: "#98c379" } },
    { scope: ["markup.deleted"], style: { foreground: "#e06c75" } },
    { scope: ["markup.link"], style: { foreground: "#5fb3d4", underline: true } },
    { scope: ["keyword", "storage", "type"], style: { foreground: "#c678dd" } },
    { scope: ["string"], style: { foreground: "#98c379" } },
    { scope: ["comment"], style: { foreground: "#6c6c80", italic: true } },
    { scope: ["number", "constant"], style: { foreground: "#d19a66" } },
    { scope: ["function", "constructor"], style: { foreground: "#61afef" } },
]);

// A select has no height of its own, so it is given one from what it holds, capped
// so a long list scrolls inside the panel instead of pushing the prompt off screen.
const CHOICE_HEIGHT = 10;

// Everything a select needs to know about its own contents, in one place: it has
// no height of its own, and it spends a second row on a description only when
// there is one to spend it on.
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
// an error in neither speaker's. The owner is what decides which box an entry
// shares, so the mode has to be carried separately rather than folded into it.
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
    switch (owner) {
        case "user":
            return USER;
        default:
            return MODE_COLOR[mode];
    }
}

// The output of an action is drawn in the same muted gray as the chrome, so the
// call it answers rather than its answer is what the eye lands on.
export const COLORS: Record<Entry["kind"], string | undefined> = {
    user: USER,
    jeng: undefined,
    think: "#6c6c80",
    tool: MODE_COLOR.learn,
    output: MUTED,
    failure: "#e06c75",
    approval: "#d19a66",
    view: undefined,
    error: "#e06c75",
};
