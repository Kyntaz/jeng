import type { AgentEvent, Approval, Draw, Mode, Widget } from "@jeng/core";

export type Entry =
    | { kind: "user"; text: string }
    | { kind: "jeng" | "think"; text: string; mode: Mode }
    | { kind: "tool" | "output" | "failure"; icon: string; text: string; mode: Mode }
    | { kind: "view"; draw: Draw; mode: Mode; answers?: Record<string, unknown> }
    | { kind: "approval"; approval: Approval }
    | { kind: "error"; icon: string; text: string };

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
 * Whether two draws are the same form. The wrapper is built twice — once by the agent
 * for the transcript and once by the host that took the port over — so what identifies
 * a form is the thing the gadget handed it, which is the same object in both.
 */
export const sameDraw = (one: Draw, other: Draw): boolean => {
    if (one.surface !== other.surface) return false;
    if (one.surface === "gui" && other.surface === "gui") return one.props === other.props;
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

// A turn is written in more than one piece, so text and thinking both join the
// entry they are already part of.
export function append(entries: Entry[], event: AgentEvent, mode: Mode): Entry[] {
    if (event.type === "text" || event.type === "reasoning") {
        const kind = event.type === "text" ? "jeng" : "think";
        const last = entries.at(-1);
        if (last?.kind === kind)
            return [...entries.slice(0, -1), { ...last, text: last.text + event.text }];
        return [...entries, { kind, text: event.text, mode }];
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
                    icon: "⚙",
                    text: args ? `${event.action} ${args}` : event.action,
                    mode,
                },
            ];
        }
        case "view":
            return [...entries, { kind: "view", draw: event.draw, mode }];
        case "result":
            // What an action returned is detail, but what it could not return is the
            // answer to whether it worked, so only the two are told apart here.
            return [
                ...entries,
                {
                    kind: event.ok ? "output" : "failure",
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
