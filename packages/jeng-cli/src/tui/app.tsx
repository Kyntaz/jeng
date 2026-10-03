import type { Agent, Approval, ApprovalDecision } from "@jeng/core";
import {
    createCliRenderer,
    type ScrollBoxRenderable,
    type TextareaRenderable,
} from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { append, approvalText, type Entry } from "./entries";
import { PromptInput } from "./prompt";
import { useSpinner } from "./spinner";
import { Footer, Header } from "./status";
import { BORDER } from "./theme";
import { BlockView, blocks } from "./transcript";

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

export function App({ agent, onExit }: { agent: Agent; onExit: () => void }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [busy, setBusy] = useState(false);
    const [tokens, setTokens] = useState(0);
    const [showThinking, setShowThinking] = useState(false);
    const [approval, setApproval] = useState<Approval | undefined>(undefined);
    const input = useRef<TextareaRenderable>(null);
    const scroller = useRef<ScrollBoxRenderable>(null);
    const running = useRef<AbortController | undefined>(undefined);
    const deciding = useRef<((decision: ApprovalDecision) => void) | undefined>(undefined);
    const spinner = useSpinner(busy);

    // The agent cannot have a UI approver until there is a UI, so it is handed one
    // here rather than at construction.
    useEffect(() => {
        agent.setApprove(
            (request) =>
                new Promise<ApprovalDecision>((resolve) => {
                    deciding.current = resolve;
                    setEntries((current) => [
                        ...current,
                        { kind: "approval", text: approvalText(request) },
                    ]);
                    setApproval(request);
                }),
        );
    }, [agent]);

    const answer = useCallback((decision: ApprovalDecision) => {
        setApproval(undefined);
        setEntries((current) => [
            ...current,
            decision.approved
                ? { kind: "tool", text: "↳ approved" }
                : { kind: "error", text: `rejected: ${decision.reason}` },
        ]);
        deciding.current?.(decision);
        deciding.current = undefined;
    }, []);

    useKeyboard((key) => {
        if (key.ctrl && key.name === "escape") onExit();
        // A pending request is the one place escape cannot mean abort, because the
        // turn is waiting on a human rather than on the model.
        if (!key.ctrl && key.name === "escape" && approval) {
            answer({ approved: false, reason: "the user interrupted" });
            return;
        }
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

    const submit = useCallback(async () => {
        const prompt = input.current?.plainText.trim() ?? "";
        input.current?.clear();

        // The box doubles as the answer to a request, so submitting while one is
        // pending decides it rather than sending another prompt.
        if (approval) {
            answer(prompt ? { approved: false, reason: prompt } : { approved: true });
            return;
        }
        if (!prompt) return;

        setEntries((current) => [...current, { kind: "user", text: prompt }]);

        // The prompt box stays focused while jeng works, so a message typed here
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
    }, [agent, approval, answer, busy]);

    const visible = useMemo(
        () => (showThinking ? entries : entries.filter((entry) => entry.kind !== "think")),
        [entries, showThinking],
    );
    const groups = useMemo(() => blocks(visible), [visible]);

    // The bars only ever draw inside the viewport, so hiding them is what keeps
    // messages from being written over. Pin them shut because a bar re-shows
    // itself whenever the scroll range changes.
    useEffect(() => {
        for (const bar of [
            scroller.current?.verticalScrollBar,
            scroller.current?.horizontalScrollBar,
        ])
            if (bar) bar.visible = false;
    }, [groups.length]);

    return (
        <box flexDirection="column" style={{ width: "100%", height: "100%" }}>
            <Header homes={agent.homes.map((home) => home.dir)} tokens={tokens} />

            <scrollbox
                ref={scroller}
                stickyScroll
                stickyStart="bottom"
                flexGrow={1}
                // A zero basis keeps the scroll region from claiming rows the
                // input and footer need, which is what squashed the line onto
                // its own bottom border.
                flexBasis={0}
                minHeight={0}
                scrollX={false}
                viewportCulling
                verticalScrollbarOptions={{ visible: false }}
                horizontalScrollbarOptions={{ visible: false }}
                style={{ width: "100%" }}
            >
                {groups.map((block, index) => (
                    <BlockView key={index} block={block} />
                ))}
                {busy && (
                    <box flexDirection="row" gap={1} paddingLeft={1}>
                        <text fg={BORDER.jeng} content={spinner} />
                        <text fg="#606070" content={approval ? "waiting for you" : "thinking"} />
                    </box>
                )}
            </scrollbox>

            <PromptInput
                input={input}
                onSubmit={() => void submit()}
                placeholder={approval ? "enter to approve, or write why to reject" : undefined}
            />
            <Footer
                busy={busy}
                showThinking={showThinking}
                spinner={spinner}
                approving={approval?.name}
            />
        </box>
    );
}
