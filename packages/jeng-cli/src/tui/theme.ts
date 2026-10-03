import type { Choice } from "@jeng/core";
import { SyntaxStyle } from "@opentui/core";
import type { Entry } from "./entries";

export const BORDER: Record<string, string> = { user: "#5fb3d4", jeng: "#d9a441" };

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

// Jeng's thinking and tools belong in its box; an error belongs to neither speaker.
export const OWNER: Record<Entry["kind"], keyof typeof BORDER | undefined> = {
    user: "user",
    jeng: "jeng",
    think: "jeng",
    tool: "jeng",
    approval: "jeng",
    view: "jeng",
    error: undefined,
};

export const COLORS: Record<Entry["kind"], string | undefined> = {
    user: undefined,
    jeng: undefined,
    think: "#6c6c80",
    tool: "#d9a441",
    approval: "#d19a66",
    view: undefined,
    error: "#e06c75",
};

export const GUTTERS = { error: "err " };
