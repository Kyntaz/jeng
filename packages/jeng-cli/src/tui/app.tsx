import {
    type Agent,
    type Answers,
    type Approval,
    type ApprovalDecision,
    fields,
    type Widget,
} from "@jeng/core";
import {
    createCliRenderer,
    type ScrollBoxRenderable,
    type TextareaRenderable,
} from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { append, approvalText, type Entry } from "./entries";
import { Panel } from "./panel";
import { PromptInput } from "./prompt";
import { useSpinner } from "./spinner";
import { Footer, Header } from "./status";
import { BORDER } from "./theme";
import { BlockView, blocks } from "./transcript";

/** A gadget's interface, waiting on a user who has not answered it yet. */
interface Ask {
    widget: Widget;
    resolve: (answers: Answers) => void;
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

export function App({ agent, onExit }: { agent: Agent; onExit: () => void }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [busy, setBusy] = useState(false);
    const [tokens, setTokens] = useState(0);
    const [showThinking, setShowThinking] = useState(false);
    const [approval, setApproval] = useState<Approval | undefined>(undefined);
    const [asking, setAsking] = useState<Ask[]>([]);
    const input = useRef<TextareaRenderable>(null);
    const scroller = useRef<ScrollBoxRenderable>(null);
    const running = useRef<AbortController | undefined>(undefined);
    const deciding = useRef<((decision: ApprovalDecision) => void) | undefined>(undefined);
    const spinner = useSpinner(busy);

    // The agent cannot have a UI approver until there is a UI, so it is handed one
    // here rather than at construction. The same goes for the interface a gadget
    // draws on, which is why handing this over is what makes the run anything but
    // headless.
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
        agent.setUi(
            (widget) =>
                new Promise<Answers>((resolve) => {
                    // Nothing to ask is nothing to wait for, so a widget that only
                    // draws goes straight to the transcript and out of the way.
                    if (fields(widget).length === 0) resolve({});
                    else setAsking((current) => [...current, { widget, resolve }]);
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

    // An answer belongs to the widget it came from, which is the same object the
    // transcript entry was built from, so nothing has to be numbered to find it.
    const settle = useCallback((ask: Ask, answers: Answers) => {
        setAsking((current) => current.filter((it) => it !== ask));
        setEntries((current) =>
            current.map((entry) =>
                entry.kind === "view" && entry.widget === ask.widget
                    ? { ...entry, answers }
                    : entry,
            ),
        );
        ask.resolve(answers);
    }, []);

    useKeyboard((key) => {
        if (key.ctrl && key.name === "escape") onExit();
        // A pending ask is the one place escape cannot mean abort, because the
        // turn is waiting on a human rather than on the model.
        if (!key.ctrl && key.name === "escape" && asking.length) {
            settle(asking[0], {});
            return;
        }
        if (!key.ctrl && key.name === "escape" && approval) {
            answer({ approved: false, reason: "the user interrupted" });
            return;
        }
        // Focus is set declaratively from the `focused` prop, which the prompt box
        // gives up while a gadget's interface is up. Escape means nothing when
        // idle, which keeps it from eating a keystroke the user meant to type.
        if (!key.ctrl && key.name === "escape" && busy) running.current?.abort();
        if (key.ctrl && key.name === "l") {
            // Anything still waiting on an answer would wait forever once the
            // transcript it was drawn in is gone.
            for (const ask of asking) ask.resolve({});
            setAsking([]);
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

    // An approval and a gadget's interface are the same thing to the user: Jeng has
    // stopped to be answered. One flag is what lets the footer say so once.
    const waiting = useMemo(
        () =>
            asking.length
                ? { enter: "enter answer", other: "tab next, esc skip" }
                : approval
                  ? { enter: `enter approve ${approval.name}`, other: "type why to reject" }
                  : undefined,
        [asking, approval],
    );

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
                        <text fg="#606070" content={waiting ? "waiting for you" : "thinking"} />
                    </box>
                )}
            </scrollbox>

            {asking.length > 0 && (
                <Panel widget={asking[0].widget} onDone={(answers) => settle(asking[0], answers)} />
            )}

            <PromptInput
                input={input}
                onSubmit={() => void submit()}
                focused={asking.length === 0}
                placeholder={
                    approval
                        ? "enter to approve, or write why to reject"
                        : asking.length
                          ? "esc to send nothing back"
                          : undefined
                }
            />
            <Footer busy={busy} showThinking={showThinking} spinner={spinner} waiting={waiting} />
        </box>
    );
}
