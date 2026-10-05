import type { CSSProperties } from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ApprovalCard } from "./approval";
import { Composer } from "./composer";
import type { Bridge } from "./rpc";
import { Transcript } from "./transcript";

// A mode is told apart by its colour. The window is cream paper rather than a terminal,
// so it picks its own two: warm ochre and dusty blue, both light enough to read on paper.
const MODE_COLOR = { learn: "#b5822f", work: "#6f93b8" };

export function App({ bridge }: { bridge: Bridge }) {
    // The third argument is what a server renderer would ask for; the window is the only
    // thing that ever reads this, and it reads the same value.
    const state = useSyncExternalStore(bridge.subscribe, bridge.get, bridge.get);
    const scroller = useRef<HTMLDivElement>(null);

    // The window asks for the state once it is listening, because there is no telling
    // when a listener is attached.
    useEffect(() => {
        void bridge.hello();
    }, []);

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
                void bridge.interrupt();
            }
            if (event.key === "F2") {
                event.preventDefault();
                void bridge.toggleThinking();
            }
        };
        window.addEventListener("keydown", keys);
        return () => window.removeEventListener("keydown", keys);
    }, []);

    if (!state) return <div className="app" />;

    const holding = state.asks.length > 0 || Boolean(state.approval);

    return (
        <div
            className="app"
            // The window's own accent, so a gadget's component inherits the mode too.
            style={{ "--jeng-accent": MODE_COLOR[state.mode] } as CSSProperties}
        >
            <header className="header">
                <span className="where">{state.homes.join(", ")}</span>
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
                <Transcript
                    entries={state.entries}
                    asks={state.asks}
                    thinking={state.thinking}
                    onAnswer={(id, answers) => void bridge.answer(id, answers)}
                    onAbandon={(id) => void bridge.abandon(id)}
                />
                {state.approval && (
                    <div className="turn">
                        <ApprovalCard
                            approval={state.approval}
                            onDecide={(decision) => void bridge.decide(decision)}
                        />
                    </div>
                )}
            </div>

            <div>
                <div className="status">
                    {state.busy && <span className="dot" />}
                    <span>
                        {state.busy ? (holding ? "waiting for you" : "thinking") : "esc interrupt"}
                    </span>
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
        </div>
    );
}
