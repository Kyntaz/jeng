import {
    type Agent,
    type Answers,
    type ApprovalDecision,
    fields,
    MODES,
    type Mode,
    type Widget,
} from "@jeng/core";
import {
    createCliRenderer,
    type ScrollBoxRenderable,
    type TextareaRenderable,
} from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApprovalBar } from "./approval";
import { useCopySelection } from "./copy";
import { append, approvalText, blank, type Entry, QUIET } from "./entries";
import { Panel } from "./panel";
import { PromptInput } from "./prompt";
import { useSpinner } from "./spinner";
import { Footer, Header, Instructions } from "./status";
import { MODE_COLOR, MUTED } from "./theme";
import { BlockView, blocks, nameOf } from "./transcript";

/** A gadget's interface, waiting on a user who has not answered it yet. */
interface Ask {
    widget: Widget;
    resolve: (answers: Answers) => void;
}

const decided = (decision: ApprovalDecision): string => {
    if (decision.approved) return "approved";
    return decision.reason ? `rejected: ${decision.reason}` : "rejected";
};

const END = Number.MAX_SAFE_INTEGER;

// A scroll is a number of screens from wherever the transcript already is rather
// than an absolute row, because the region clamps to its own extent and a row
// number would have to come from a height that is still being measured.
function scroll(region: ScrollBoxRenderable | null, screens: number): void {
    region?.scrollBy(screens, screens === END ? "content" : "viewport");
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
    const [mode, setMode] = useState<Mode>(agent.mode);
    const [showThinking, setShowThinking] = useState(false);
    const [awaiting, setAwaiting] = useState(false);
    const [asking, setAsking] = useState<Ask[]>([]);
    const input = useRef<TextareaRenderable>(null);
    const scroller = useRef<ScrollBoxRenderable>(null);
    const running = useRef<AbortController | undefined>(undefined);
    const deciding = useRef<((decision: ApprovalDecision) => void) | undefined>(undefined);
    const spinner = useSpinner(busy);
    useCopySelection();

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
                        { kind: "approval", icon: "⚑", text: approvalText(request) },
                    ]);
                    setAwaiting(true);
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

    const fail = useCallback((text: string) => {
        setEntries((current) => [...current, { kind: "error", icon: "err", text }]);
    }, []);

    const answer = useCallback((decision: ApprovalDecision) => {
        setAwaiting(false);
        // An answer is the user talking, so it wears the user's green rather than
        // sitting in the margin as chrome the model wrote.
        setEntries((current) => [...current, { kind: "user", text: decided(decision) }]);
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
        // The transcript is read by scrolling it, and the prompt holds the focus, so
        // the keys that scroll are taken here rather than left to the scroll region,
        // which never sees one. `end` alone is the prompt's own, so the jump to the
        // bottom is the modified one.
        if (key.ctrl && key.name === "end") scroll(scroller.current, END);
        else if (key.name === "pageup") scroll(scroller.current, -1);
        else if (key.name === "pagedown") scroll(scroller.current, 1);
        if (key.ctrl && key.name === "escape") onExit();
        // A pending ask is the one place escape cannot mean abort, because the
        // turn is waiting on a human rather than on the model.
        if (!key.ctrl && key.name === "escape" && asking.length) {
            settle(asking[0], {});
            return;
        }
        if (!key.ctrl && key.name === "escape" && awaiting) {
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
        // Tab walks the answers of an interface or an approval, so it only changes
        // the mode when the prompt holds the keys. The switch takes hold at the
        // next model call, which is what leaves a turn in one piece.
        if (!key.shift && !key.ctrl && key.name === "tab" && !asking.length && !awaiting)
            setMode((current) => {
                const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
                agent.setMode(next);
                return next;
            });
    });

    const submit = useCallback(async () => {
        const prompt = input.current?.plainText.trim() ?? "";
        input.current?.clear();
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
        // Read once per turn rather than per event, so a mode switched while
        // Jeng works stamps the whole turn rather than splitting it in two.
        const speaking = mode;
        try {
            let streamed = "";
            const reply = await agent.send(prompt, {
                signal: running.current.signal,
                onEvent: (event) => {
                    if (event.type === "usage") setTokens(event.promptTokens);
                    else {
                        if (event.type === "text") streamed += event.text;
                        setEntries((current) => append(current, event, speaking));
                    }
                },
            });
            if (reply.trim() && reply.trim() !== streamed.trim())
                setEntries((current) => [
                    ...current,
                    { kind: "jeng", text: reply, mode: speaking },
                ]);
        } catch (error) {
            if (running.current.signal.aborted) fail("interrupted");
            else fail((error as Error).message);
        } finally {
            running.current = undefined;
            setBusy(false);
        }
    }, [agent, busy, fail, mode]);

    // The transcript is the record, so an interface is only drawn here once it has
    // been answered. While it is still waiting, the panel below is the one and only
    // copy, and drawing a second one here is what made the form unscrollable.
    const visible = useMemo(
        () =>
            entries.filter(
                (entry) =>
                    !(entry.kind === "view" && asking.some((ask) => ask.widget === entry.widget)) &&
                    (showThinking || (!QUIET.includes(entry.kind) && !blank(entry))),
            ),
        [entries, showThinking, asking],
    );
    const groups = useMemo(() => blocks(visible), [visible]);

    // An approval and a gadget's interface are the same thing to the user: Jeng has
    // stopped to be answered. One flag is what lets the footer say so once.
    const waiting = useMemo(
        () =>
            asking.length
                ? { enter: "enter answer", other: "tab next, esc skip" }
                : awaiting
                  ? { enter: "enter picks", other: "tab moves, esc rejects" }
                  : undefined,
        [asking, awaiting],
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
                // The header is laid over this region's first row, so the transcript
                // keeps a row of its own clear of it rather than being sliced by it.
                paddingTop={1}
                verticalScrollbarOptions={{ visible: false }}
                horizontalScrollbarOptions={{ visible: false }}
                style={{ width: "100%" }}
            >
                <Instructions agents={agent.agents} cwd={agent.cwd} />
                {groups.map((block) => (
                    <BlockView key={nameOf(block)} block={block} />
                ))}
                {busy && (
                    <box flexDirection="row" gap={1} paddingLeft={1}>
                        <text fg={MODE_COLOR[mode]} content={spinner} />
                        <text fg={MUTED} content={waiting ? "waiting for you" : "thinking"} />
                    </box>
                )}
                {/* The form is drawn here rather than below the transcript, so a tall
                    interface scrolls with everything else instead of claiming rows the
                    prompt needs and cannot be scrolled through. */}
                {asking.length > 0 && (
                    <Panel
                        widget={asking[0].widget}
                        onDone={(answers) => settle(asking[0], answers)}
                    />
                )}
            </scrollbox>

            {awaiting && <ApprovalBar onDecide={answer} />}

            <PromptInput
                input={input}
                onSubmit={() => void submit()}
                mode={mode}
                focused={asking.length === 0 && !awaiting}
                visible={!awaiting}
            />
            <Footer busy={busy} showThinking={showThinking} spinner={spinner} waiting={waiting} />

            {/* The header is laid over the transcript's first row rather than
                pushing it down, because a scroll region that starts below another
                row is clipped against the top of the screen instead of against
                itself, and the transcript lands on the header. */}
            <box position="absolute" top={0} left={0} width="100%" zIndex={1}>
                <Header
                    homes={agent.homes.map((home) => home.dir)}
                    model={agent.model}
                    tokens={tokens}
                    mode={mode}
                />
            </box>
        </box>
    );
}
