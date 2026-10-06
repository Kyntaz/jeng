// The deep import is deliberate: the barrel drags in the conversation and with it
// `@jeng/core`, whose `node:` imports this view's build drops on the floor.
import { place } from "@jeng/view/place";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApprovalCard } from "./approval";
import { Composer } from "./composer";
import { Picker } from "./picker";
import type { Bridge } from "./rpc";
import { useSpinner } from "./spinner";
import { Transcript } from "./transcript";

// A mode is told apart by its colour. The window is cream paper rather than a terminal,
// so it picks its own two: warm ochre and dusty blue, both light enough to read on paper.
const MODE_COLOR = { learn: "#b5822f", work: "#6f93b8" };

export function App({ bridge }: { bridge: Bridge }) {
    // The third argument is what a server renderer would ask for; the window is the only
    // thing that ever reads this, and it reads the same value.
    const state = useSyncExternalStore(bridge.subscribe, bridge.get, bridge.get);
    const scroller = useRef<HTMLDivElement>(null);
    const [picking, setPicking] = useState(false);
    const [configs, setConfigs] = useState<string[]>([]);
    const spinner = useSpinner(Boolean(state?.busy));

    // The window asks for the state once it is listening, because there is no telling
    // when a listener is attached. The configs it has been shown come back with it.
    useEffect(() => {
        void bridge.hello().then(setConfigs);
    }, [bridge]);

    useEffect(() => {
        const element = scroller.current;
        if (!element) return;
        // Only follow along while the reader is at the bottom, so scrolling back to read
        // something is not undone by the next thing said.
        const near = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        if (near) element.scrollTop = element.scrollHeight;
    }, [state]);

    useEffect(() => {
        const keys = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                // Escape closes the picker rather than interrupting behind it, which is
                // the one thing about it that is not a turn.
                if (picking) setPicking(false);
                else void bridge.interrupt();
            }
            if (event.key === "F2") {
                event.preventDefault();
                void bridge.toggleThinking();
            }
        };
        window.addEventListener("keydown", keys);
        return () => window.removeEventListener("keydown", keys);
    }, [bridge, picking]);

    if (!state) return <div className="app" />;

    const holding = state.asks.length > 0 || Boolean(state.approval);
    const waiting = holding ? "waiting for you" : "thinking";

    return (
        <div
            className="app"
            // The window's own accent, so a gadget's component inherits the mode too.
            style={{ "--jeng-accent": MODE_COLOR[state.mode] } as CSSProperties}
        >
            <header className="header">
                {/* The two things the window can be pointed elsewhere are its first two
                 * items, and they are buttons that read as text. */}
                <button type="button" className="where" onClick={() => setPicking(true)}>
                    {state.cwd}
                </button>
                <button type="button" className="where" onClick={() => setPicking(true)}>
                    {state.config ? place(state.config, state.cwd) : "environment"}
                </button>
                <span className="where">
                    {state.homes.map((home) => place(home, state.cwd)).join(", ")}
                </span>
                <span>{state.model}</span>
                <span className="grow" />
                <span>{state.tokens} tokens</span>
                <button
                    type="button"
                    className="chip"
                    onClick={() => void bridge.setMode(state.mode === "learn" ? "work" : "learn")}
                >
                    {state.mode}
                </button>
            </header>

            <div className="scroll" ref={scroller}>
                {state.agents.length > 0 && (
                    <div className="instructions">
                        {state.agents.map((dir) => (
                            <span key={dir}>{`▪ ${place(dir, state.cwd)}/AGENTS.md`}</span>
                        ))}
                    </div>
                )}
                <Transcript
                    entries={state.entries}
                    asks={state.asks}
                    thinking={state.thinking}
                    approving={state.approval?.id}
                    onAnswer={(id, answers) => void bridge.answer(id, answers)}
                    onAbandon={(id) => void bridge.abandon(id)}
                />
                {/* Under the last thing said rather than in the bar, because the bar says
                 * that Jeng is busy and this says it is still going. */}
                {state.busy && (
                    <div className="working">
                        <span>{spinner}</span>
                        <span>{waiting}</span>
                    </div>
                )}
                {state.approval && (
                    <div className="turn">
                        <ApprovalCard
                            approval={state.approval.approval}
                            onDecide={(decision) => void bridge.decide(decision)}
                        />
                    </div>
                )}
            </div>

            <div>
                <div className="status">
                    {state.busy && <span className="dot" />}
                    <span>{state.busy ? waiting : "esc interrupt"}</span>
                    <span className="grow" />
                    <button type="button" onClick={() => void bridge.toggleThinking()}>
                        {state.thinking ? "hide detail" : "detail"}
                    </button>
                    <button type="button" onClick={() => void bridge.clear()}>
                        clear
                    </button>
                </div>
                <Composer
                    busy={state.busy}
                    holding={holding}
                    onSend={(text) => void bridge.send(text)}
                    onInterrupt={() => void bridge.interrupt()}
                />
            </div>

            {picking && (
                <Picker
                    bridge={bridge}
                    configs={configs}
                    state={state}
                    onConfigs={setConfigs}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
