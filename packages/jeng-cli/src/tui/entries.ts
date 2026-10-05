import type { AgentEvent, Answers, Approval, Mode, Widget } from "@jeng/core";

// Everything Jeng says, thinks or calls carries the mode it was said in, because
// a mode switched halfway through a conversation must not repaint the half that
// came before it.
export type Entry =
    | { kind: "user"; text: string }
    | { kind: "jeng" | "think"; text: string; mode: Mode }
    | { kind: "tool" | "output" | "failure"; icon: string; text: string; mode: Mode }
    | { kind: "view"; widget: Widget; mode: Mode; answers?: Answers }
    | { kind: "approval"; icon: string; text: string }
    | { kind: "error"; icon: string; text: string };

// What the toggle holds back: the thinking behind a reply, the output behind an
// action, and a turn that went wrong. A failure is none of those -- it is the answer
// to whether an action worked, and the call above it says nothing without it.
export const QUIET: Entry["kind"][] = ["think", "output", "error"];

// A box drawn around nothing is just a border, so a message that carries no words is
// not one.
export const blank = (entry: Entry): boolean =>
    entry.kind === "view" ? blankWidget(entry.widget) : !entry.text.trim();

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
            return [...entries, { kind: "view", widget: event.widget, mode }];
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

// The whole source goes in, because the point is that the user reads what they are
// being asked to allow rather than a summary of it.
export function approvalText(request: Approval): string {
    return [
        `${request.kind} \`${request.name}\``,
        ...(request.reason ? [`why: ${request.reason}`] : []),
        "",
        request.source,
    ].join("\n");
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
