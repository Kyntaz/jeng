import type { SessionRef } from "@jeng/core";
import { place } from "@jeng/view";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApprovalCard } from "./approval";
import { Composer } from "./composer";
import { Picker } from "./picker";
import type { Bridge } from "./rpc";
import { useSpinner } from "./spinner";
import { Transcript } from "./transcript";

// A mode is told apart by its colour, and the window wears the same two the terminal
// does, so the same sentence reads the same way in both. Each comes in two strengths,
// because the bright one is a block that takes dark type and no other will do, and a
// line drawn on the cream paper wants the same hue a long way down or it does not
// read at all.
const MODE_COLOR = {
    learn: { accent: "#d9a441", tint: "#f8ebd4", ink: "#8a6410" },
    work: { accent: "#5fb3d4", tint: "#d7e8f2", ink: "#435175" },
};

export function App({ bridge }: { bridge: Bridge }) {
    // The third argument is what a server renderer would ask for; the window is the only
    // thing that ever reads this, and it reads the same value.
    const state = useSyncExternalStore(bridge.subscribe, bridge.get, bridge.get);
    const scroller = useRef<HTMLDivElement>(null);
    const [picking, setPicking] = useState(false);
    const [configs, setConfigs] = useState<string[]>([]);
    const [sessions, setSessions] = useState<SessionRef[]>([]);
    const spinner = useSpinner(Boolean(state?.busy));

    // The window asks for the state once it is listening, because there is no telling
    // when a listener is attached. The configs it has been shown come back with it.
    useEffect(() => {
        void bridge.hello().then(setConfigs);
    }, [bridge]);

    // Which sessions there are follows the homes the window is pointed at, so the list is
    // read when the picker is opened rather than kept in step with it.
    useEffect(() => {
        if (!picking) return;
        void bridge.sessions().then(setSessions, () => setSessions([]));
    }, [bridge, picking]);

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
            // The window's own mode, so a gadget's component inherits it too. They are all
            // set on the same element, since a wash written in :root could not read the
            // accent this one puts back.
            style={
                {
                    "--jeng-accent": MODE_COLOR[state.mode].accent,
                    "--jeng-accent-tint": MODE_COLOR[state.mode].tint,
                    "--jeng-accent-ink": MODE_COLOR[state.mode].ink,
                } as CSSProperties
            }
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
                    sessions={sessions}
                    state={state}
                    onConfigs={setConfigs}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
