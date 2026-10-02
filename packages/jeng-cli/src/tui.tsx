import type { Agent, AgentEvent } from "@jeng/core";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useCallback, useState } from "react";

interface Entry {
    kind: "user" | "jeng" | "tool" | "error";
    text: string;
}

const COLORS = { user: "#5fb3d4", jeng: "#e8e8e8", tool: "#d9a441", error: "#e06c75" };
const GUTTERS = { user: "you", jeng: "jeng", tool: " ", error: "!!" };

function append(entries: Entry[], event: AgentEvent): Entry[] {
    switch (event.type) {
        case "text": {
            const last = entries.at(-1);
            if (last?.kind === "jeng")
                return [...entries.slice(0, -1), { ...last, text: last.text + event.text }];
            return [...entries, { kind: "jeng", text: event.text }];
        }
        case "tool":
            return [
                ...entries,
                { kind: "tool", text: `⚙ ${event.action} ${describe(event.args)}` },
            ];
        case "result":
            return [...entries, { kind: "tool", text: `↳ ${event.content}` }];
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

export async function renderTui(agent: Agent): Promise<void> {
    const renderer = await createCliRenderer({ exitOnCtrlC: true });
    try {
        await new Promise<void>((resolve) => {
            createRoot(renderer).render(<App agent={agent} onExit={() => resolve()} />);
            renderer.once("destroy", () => resolve());
        });
    } finally {
        renderer.destroy();
    }
}

function App({ agent, onExit }: { agent: Agent; onExit: () => void }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [busy, setBusy] = useState(false);

    useKeyboard((key) => {
        if (key.name === "escape" && key.ctrl) onExit();
    });

    const submit = useCallback(
        async (value: string) => {
            const prompt = value.trim();
            if (!prompt || busy) return;
            setBusy(true);
            setEntries((current) => [...current, { kind: "user", text: prompt }]);
            try {
                await agent.send(prompt, {
                    onEvent: (event) => setEntries((current) => append(current, event)),
                });
            } catch (error) {
                setEntries((current) => [
                    ...current,
                    { kind: "error", text: (error as Error).message },
                ]);
            } finally {
                setBusy(false);
            }
        },
        [agent, busy],
    );

    return (
        <box flexDirection="column" style={{ width: "100%", height: "100%" }}>
            <box flexDirection="row" gap={2} paddingLeft={1}>
                <text fg="#d9a441" content="jeng" />
                <text fg="#606070" content={agent.homes.map((home) => home.dir).join(", ")} />
            </box>

            <scrollbox
                focused={busy}
                stickyScroll
                stickyStart="bottom"
                flexGrow={1}
                style={{ width: "100%" }}
            >
                {entries.map((entry, index) => (
                    <box key={index} flexDirection="row" paddingLeft={1}>
                        <text fg={COLORS[entry.kind]} content={GUTTERS[entry.kind]} />
                        <text fg={COLORS[entry.kind]} content={entry.text} />
                    </box>
                ))}
            </scrollbox>

            <box border paddingLeft={1}>
                <input
                    placeholder={busy ? "jeng is working..." : "say something"}
                    focused={!busy}
                    onSubmit={(value) => void submit(String(value))}
                />
            </box>
            <box paddingLeft={1}>
                <text fg="#606070" content="ctrl+esc to quit" />
            </box>
        </box>
    );
}
