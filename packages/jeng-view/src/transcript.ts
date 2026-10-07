import type { AgentEvent, Approval, Draw, Mode, Widget } from "@jeng/core";

/**
 * One line of the conversation, named by a number.
 *
 * The number is what a row is called by, and it is what it is called by in a window
 * rather than in the terminal, because a window reads its state as JSON: there, being
 * the same object stops meaning anything, and a row named by what it holds would be a
 * new row every time anything else on screen changed. An approval's number is the one
 * the conversation is asked about, so the same number says which record is the one
 * still waiting.
 */
export type Entry =
    | { kind: "user"; id: number; text: string }
    | { kind: "jeng" | "think"; id: number; text: string; mode: Mode }
    | { kind: "tool" | "output" | "failure"; id: number; icon: string; text: string; mode: Mode }
    | { kind: "view"; id: number; draw: Draw; mode: Mode; answers?: Record<string, unknown> }
    | { kind: "approval"; id: number; approval: Approval }
    | { kind: "error"; id: number; icon: string; text: string };

// What the toggle holds back: the thinking behind a reply, the output behind an
// action, and a turn that went wrong. A failure is none of those -- it is the answer
// to whether an action worked, and the call above it says nothing without it.
export const QUIET: Entry["kind"][] = ["think", "output", "error"];

// A box drawn around nothing is just a border, so a message that carries no words is
// not one. An approval is never blank: the user is being asked to read it.
export const blank = (entry: Entry): boolean => {
    if (entry.kind === "approval") return false;
    return entry.kind === "view" ? blankDraw(entry.draw) : !entry.text.trim();
};

/**
 * Whether two draws are the same form. The wrapper is built twice — once by the agent for
 * the transcript and once for the host that took the port over — so what identifies a form
 * is the number the agent gave it, which both copies carry and neither can lose.
 *
 * A component is numbered because a window reads its state as JSON, where being the same
 * object stops meaning anything: without the number the window cannot tell the transcript's
 * copy of a form from the ask it belongs to, and hands the gadget no way to answer. A widget
 * tree still goes by identity, because the terminal holds the same objects throughout and
 * has no reason to number anything.
 */
const sameDraw = (one: Draw, other: Draw): boolean => {
    if (one.surface !== other.surface) return false;
    if (one.surface === "gui" && other.surface === "gui") return one.id === other.id;
    return one.surface === "tui" && other.surface === "tui" && one.widget === other.widget;
};

/** Whether a transcript entry is the form a given ask opened. */
export const isAsk = (entry: Entry, ask: { draw: Draw }): boolean =>
    entry.kind === "view" && sameDraw(entry.draw, ask.draw);

const blankDraw = (draw: Draw): boolean => {
    // A component is the gadget's own code, so there is no telling whether it draws
    // anything: whatever it was asked for, it was asked for.
    if (draw.surface === "gui") return false;

    return blankWidget(draw.widget);
};

const blankWidget = (widget: Widget): boolean => {
    switch (widget.kind) {
        case "box":
            return widget.children.every(blankWidget);
        case "select":
        case "input":
        case "textarea":
            return false;
        case "diff":
            return !widget.diff.trim();
        default:
            return !widget.content.trim();
    }
};

/**
 * A turn is written in more than one piece, so text and thinking both join the entry they
 * are already part of — keeping the number they were given, because a reply arriving a
 * word at a time is one row the whole way through rather than one row per word.
 *
 * The row they belong to is named by the number the caller gave them, so a piece is only ever
 * joined to the one before it when they were given the same number: a host hands every piece
 * of one reply the same number and takes a new one per reply, so two replies are two rows
 * even though nothing but words arrives between them.
 */
export function append(entries: Entry[], event: AgentEvent, mode: Mode, id: number): Entry[] {
    if (event.type === "text" || event.type === "reasoning") {
        const kind = event.type === "text" ? "jeng" : "think";
        const last = entries.at(-1);
        if (last?.kind === kind && last.id === id)
            return [...entries.slice(0, -1), { ...last, text: last.text + event.text }];
        return [...entries, { kind, id, text: event.text, mode }];
    }

    switch (event.type) {
        case "tool": {
            // The answer an end carries is drawn in the box that follows it, so a
            // box of its own here would only say what that box already says.
            if (event.action === "end") return entries;
            const args = describe(event.args);
            return [
                ...entries,
                {
                    kind: "tool",
                    id,
                    icon: "⚙",
                    text: args ? `${event.action} ${args}` : event.action,
                    mode,
                },
            ];
        }
        case "view":
            return [...entries, { kind: "view", id, draw: event.draw, mode }];
        case "result":
            // What an action returned is detail, but what it could not return is the
            // answer to whether it worked, so only the two are told apart here.
            return [
                ...entries,
                {
                    kind: event.ok ? "output" : "failure",
                    id,
                    icon: "↳",
                    text: event.content,
                    mode,
                },
            ];
        case "usage":
            return entries;
    }
}

function describe(args: Record<string, unknown>): string {
    return Object.entries(args)
        .filter(([key]) => key !== "action")
        .map(
            ([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
        )
        .join(" ")
        .slice(0, 80);
}
