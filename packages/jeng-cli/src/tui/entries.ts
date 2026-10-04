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

// What the toggle holds back: the thinking behind a reply and the output behind an
// action. A failure is neither -- it is the user being told something went wrong, so
// it stays whatever the toggle says.
export const QUIET: Entry["kind"][] = ["think", "output"];

export function append(entries: Entry[], event: AgentEvent, mode: Mode): Entry[] {
    switch (event.type) {
        case "text": {
            const last = entries.at(-1);
            if (last?.kind === "jeng")
                return [...entries.slice(0, -1), { ...last, text: last.text + event.text }];
            return [...entries, { kind: "jeng", text: event.text, mode }];
        }
        case "reasoning": {
            const last = entries.at(-1);
            if (last?.kind === "think")
                return [...entries.slice(0, -1), { ...last, text: last.text + event.text }];
            return [...entries, { kind: "think", text: event.text, mode }];
        }
        case "tool": {
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

// The whole source goes in, because the point of the request is that the user
// reads what they are being asked to allow rather than a summary of it. The
// marker is the reader's to add, because each one lays its lines out differently.
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
