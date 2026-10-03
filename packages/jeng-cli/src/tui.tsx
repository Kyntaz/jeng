import type { Agent, AgentEvent } from "@jeng/core";
import { createCliRenderer, type InputRenderable } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Entry {
    kind: "user" | "jeng" | "think" | "tool" | "error";
    text: string;
}

const BORDER: Record<string, string> = { user: "#5fb3d4", jeng: "#d9a441" };

// Jeng's thinking and tools belong in its box; an error belongs to neither speaker.
const OWNER: Record<Entry["kind"], keyof typeof BORDER | undefined> = {
    user: "user",
    jeng: "jeng",
    think: "jeng",
    tool: "jeng",
    error: undefined,
};

const COLORS: Record<Entry["kind"], string | undefined> = {
    user: undefined,
    jeng: undefined,
    think: "#6c6c80",
    tool: "#d9a441",
    error: "#e06c75",
};

const GUTTERS = { error: "err " };

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

interface Block {
    border?: string;
    entries: Entry[];
}

function blocks(entries: Entry[]): Block[] {
    const result: Block[] = [];
    for (const entry of entries) {
        const owner = OWNER[entry.kind];
        const border = owner ? BORDER[owner] : undefined;
        const last = result.at(-1);
        if (border && last?.border === border) last.entries.push(entry);
        else result.push({ border, entries: [entry] });
    }
    return result;
}

function useSpinner(active: boolean): string {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => setFrame((index) => (index + 1) % FRAMES.length), 80);
        return () => clearInterval(timer);
    }, [active]);
    return FRAMES[frame];
}

function append(entries: Entry[], event: AgentEvent): Entry[] {
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

const compact = (tokens: number) =>
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);

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
    const [tokens, setTokens] = useState(0);
    const [showThinking, setShowThinking] = useState(false);
    const input = useRef<InputRenderable>(null);
    const running = useRef<AbortController | undefined>(undefined);
    const spinner = useSpinner(busy);

    useKeyboard((key) => {
        if (key.ctrl && key.name === "escape") onExit();
        // Focus is set declaratively from the `focused` prop and stays true, so
        // nothing can pull the cursor out of the line. Escape means nothing when
        // idle, which keeps it from eating a keystroke the user meant to type.
        if (!key.ctrl && key.name === "escape" && busy) running.current?.abort();
        if (key.ctrl && key.name === "l") {
            agent.clear();
            setEntries([]);
            setTokens(0);
        }
        if (key.ctrl && key.name === "r") setShowThinking((value) => !value);
    });

    const submit = useCallback(
        async (value: string) => {
            const prompt = value.trim();
            if (!prompt) return;
            if (input.current) input.current.value = "";
            setEntries((current) => [...current, { kind: "user", text: prompt }]);

            // The line stays focused while jeng works, so a message typed here
            // reaches it between its calls rather than interrupting one.
            if (busy) {
                agent.inject(prompt);
                return;
            }

            setBusy(true);
            running.current = new AbortController();
            try {
                let streamed = "";
                const reply = await agent.send(prompt, {
                    signal: running.current.signal,
                    onEvent: (event) => {
                        if (event.type === "usage") setTokens(event.promptTokens);
                        else {
                            if (event.type === "text") streamed += event.text;
                            setEntries((current) => append(current, event));
                        }
                    },
                });
                if (reply.trim() && reply.trim() !== streamed.trim())
                    setEntries((current) => [...current, { kind: "jeng", text: reply }]);
            } catch (error) {
                if (running.current.signal.aborted)
                    setEntries((current) => [...current, { kind: "error", text: "interrupted" }]);
                else
                    setEntries((current) => [
                        ...current,
                        { kind: "error", text: (error as Error).message },
                    ]);
            } finally {
                running.current = undefined;
                setBusy(false);
            }
        },
        [agent, busy],
    );

    const visible = showThinking ? entries : entries.filter((entry) => entry.kind !== "think");

    return (
        <box flexDirection="column" style={{ width: "100%", height: "100%" }}>
            <box flexDirection="row" gap={2} paddingLeft={1}>
                <text fg="#d9a441" content="jeng" />
                <text fg="#606070" content={agent.homes.map((home) => home.dir).join(", ")} />
                <text fg="#606070" content={`ctx ${compact(tokens)}`} />
            </box>

            <scrollbox stickyScroll stickyStart="bottom" flexGrow={1} style={{ width: "100%" }}>
                {blocks(visible).map((block, index) =>
                    block.border ? (
                        <box
                            key={index}
                            border
                            borderColor={block.border}
                            flexDirection="column"
                            paddingLeft={1}
                            marginBottom={1}
                        >
                            {block.entries.map((entry, row) => (
                                <text key={row} fg={COLORS[entry.kind]} content={entry.text} />
                            ))}
                        </box>
                    ) : (
                        <box key={index} flexDirection="row" gap={1} paddingLeft={1}>
                            <text fg={COLORS.error} content={GUTTERS.error} />
                            <text fg={COLORS.error} content={block.entries[0].text} />
                        </box>
                    ),
                )}
            </scrollbox>

            <box border paddingLeft={1}>
                <input ref={input} focused onSubmit={(value) => void submit(String(value))} />
            </box>
            <box flexDirection="row" gap={2} paddingLeft={1}>
                <text fg="#606070" content="ctrl+esc quit" />
                <text fg="#606070" content="ctrl+l clear" />
                <text fg="#606070" content="esc interrupt" />
                <text fg={showThinking ? "#d9a441" : "#606070"} content="ctrl+r thinking" />
                {busy && <text fg={BORDER.jeng} content={`${spinner} thinking`} />}
            </box>
        </box>
    );
}
