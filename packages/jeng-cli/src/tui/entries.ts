import type { AgentEvent } from "@jeng/core";

export interface Entry {
    kind: "user" | "jeng" | "think" | "tool" | "error";
    text: string;
}

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
        case "tool":
            return [
                ...entries,
                { kind: "tool", text: `⚙ ${event.action} ${describe(event.args)}` },
            ];
        case "result":
            return [...entries, { kind: "tool", text: `↳ ${event.content}` }];
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
