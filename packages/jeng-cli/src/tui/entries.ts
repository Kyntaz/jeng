import type { AgentEvent, Answers, Approval, Widget } from "@jeng/core";

export type Entry =
    | { kind: "user" | "jeng" | "think"; text: string }
    | { kind: "tool" | "approval" | "error"; icon: string; text: string }
    | { kind: "view"; widget: Widget; answers?: Answers };

export function append(entries: Entry[], event: AgentEvent): Entry[] {
    switch (event.type) {
        case "text": {
            const last = entries.at(-1);
            if (last?.kind === "jeng")
                return [...entries.slice(0, -1), { ...last, text: last.text + event.text }];
            return [...entries, { kind: "jeng", text: event.text }];
        }
        case "reasoning": {
            const last = entries.at(-1);
            if (last?.kind === "think")
                return [...entries.slice(0, -1), { ...last, text: last.text + event.text }];
            return [...entries, { kind: "think", text: event.text }];
        }
        case "tool": {
            const args = describe(event.args);
            return [
                ...entries,
                { kind: "tool", icon: "⚙", text: args ? `${event.action} ${args}` : event.action },
            ];
        }
        case "view":
            return [...entries, { kind: "view", widget: event.widget }];
        case "result":
            return [...entries, { kind: "tool", icon: "↳", text: event.content }];
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
