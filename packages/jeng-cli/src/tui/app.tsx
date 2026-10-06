import type { Agent } from "@jeng/core";
import { blank, type Conversation, createConversation, isAsk, QUIET } from "@jeng/view";
import {
    createCliRenderer,
    type KeyEvent,
    type ScrollBoxRenderable,
    type TextareaRenderable,
} from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { ApprovalBar } from "./approval";
import { useCopySelection } from "./copy";
import { Panel } from "./panel";
import { PromptInput } from "./prompt";
import { useSpinner } from "./spinner";
import { Footer, Header, Instructions } from "./status";
import { MODE_COLOR, MUTED } from "./theme";
import { BlockView, blocks, nameOf } from "./transcript";

const END = Number.MAX_SAFE_INTEGER;

// A scroll is a number of screens from wherever the transcript already is rather
// than an absolute row, because the region clamps to its own extent.
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

/**
 * The prompt holds the focus, so the keys that scroll the transcript are taken here rather
 * than left to the scroll region, which never sees one.
 */
function onKeys(
    talk: Conversation,
    scrollTo: (screens: number) => void,
    holding: boolean,
    onExit: () => void,
) {
    return (key: KeyEvent): void => {
        const plain = !key.ctrl && !key.shift;

        if (key.name === "pageup") scrollTo(-1);
        else if (key.name === "pagedown") scrollTo(1);
        else if (key.ctrl && key.name === "end") scrollTo(END);
        // Escape means nothing when idle, which keeps it from eating a keystroke, and
        // it reaches for whatever is holding the turn up rather than cutting it short.
        else if (key.ctrl && key.name === "escape") onExit();
        else if (plain && key.name === "escape") talk.escape();
        else if (key.ctrl && key.name === "l") talk.clear();
        else if (key.ctrl && key.name === "r") talk.toggleThinking();
        else if (plain && key.name === "tab" && !holding) talk.toggleMode();
    };
}

export function App({ agent, onExit }: { agent: Agent; onExit: () => void }) {
    const talk = useMemo(() => createConversation(agent), [agent]);
    const state = useSyncExternalStore(talk.subscribe, talk.get);
    const input = useRef<TextareaRenderable>(null);
    const scroller = useRef<ScrollBoxRenderable>(null);
    const showThinking = state.thinking;
    const spinner = useSpinner(state.busy);
    useCopySelection();

    // The agent cannot have an interface to draw on until there is one, so the port is
    // handed over here rather than at construction.
    useEffect(() => {
        agent.setUi((widget) => talk.ask({ surface: "tui", widget }));
    }, [agent, talk]);

    // An approval and a gadget's interface are the same thing to the user: Jeng has
    // stopped to be answered, which is what decides whether tab walks the answers.
    const holding = state.asks.length > 0 || state.approval !== undefined;

    useKeyboard(onKeys(talk, (screens) => scroll(scroller.current, screens), holding, onExit));

    // The transcript is the record, so an interface is only drawn here once answered.
    const visible = useMemo(
        () =>
            state.entries.filter(
                (entry) =>
                    !state.asks.some((ask) => isAsk(entry, ask)) &&
                    (showThinking || (!QUIET.includes(entry.kind) && !blank(entry))),
            ),
        [state.entries, showThinking, state.asks],
    );
    const groups = useMemo(() => blocks(visible), [visible]);

    // One form is up at a time, and the transcript is the record rather than a panel, so
    // a tall interface scrolls with everything else.
    const pending = talk.pending;

    const waiting = useMemo(
        () =>
            state.asks.length
                ? { enter: "enter answer", other: "tab next, esc skip" }
                : state.approval
                  ? { enter: "enter picks", other: "tab moves, esc rejects" }
                  : undefined,
        [state.asks.length, state.approval],
    );

    // The bars only ever draw inside the viewport, so hiding them is what keeps
    // messages from being written over.
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
                // A zero basis keeps the scroll region from claiming the rows the
                // input and footer need.
                flexBasis={0}
                minHeight={0}
                scrollX={false}
                viewportCulling
                // The header is laid over this region's first row, so the transcript
                // keeps a row of its own clear of it.
                paddingTop={1}
                verticalScrollbarOptions={{ visible: false }}
                horizontalScrollbarOptions={{ visible: false }}
                style={{ width: "100%" }}
            >
                <Instructions agents={agent.agents} cwd={agent.cwd} />
                {groups.map((block) => (
                    <BlockView key={nameOf(block)} block={block} />
                ))}
                {state.busy && (
                    <box flexDirection="row" gap={1} paddingLeft={1}>
                        <text fg={MODE_COLOR[state.mode]} content={spinner} />
                        <text fg={MUTED} content={waiting ? "waiting for you" : "thinking"} />
                    </box>
                )}
                {/* The form is drawn here rather than below the transcript, so a tall
                 interface scrolls with everything else. Keyed because a form that
                 reuses the last one's answers would answer itself. */}
                {pending?.draw.surface === "tui" && (
                    <Panel
                        key={pending.id}
                        widget={pending.draw.widget}
                        onDone={(answers) => talk.answer(pending.id, answers)}
                    />
                )}
            </scrollbox>

            {state.approval && <ApprovalBar onDecide={(decision) => talk.decide(decision)} />}

            <PromptInput
                input={input}
                onSubmit={() => void onSend(talk, input)}
                mode={state.mode}
                focused={state.asks.length === 0 && !state.approval}
                visible={!state.approval}
            />
            <Footer
                busy={state.busy}
                showThinking={showThinking}
                spinner={spinner}
                waiting={waiting}
            />

            {/* Laid over the transcript's first row rather than pushing it down, because a
             scroll region that starts below another row is clipped against the
             top of the screen. */}
            <box position="absolute" top={0} left={0} width="100%" zIndex={1}>
                <Header
                    cwd={agent.cwd}
                    homes={agent.homes.map((home) => home.dir)}
                    model={agent.model}
                    tokens={state.tokens}
                    mode={state.mode}
                />
            </box>
        </box>
    );
}

async function onSend(
    talk: ReturnType<typeof createConversation>,
    input: { current: TextareaRenderable | null },
): Promise<void> {
    const prompt = input.current?.plainText.trim() ?? "";
    input.current?.clear();
    await talk.send(prompt);
}
