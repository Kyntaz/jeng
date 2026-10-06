import type { SessionRef } from "@jeng/core";
import { place, type State } from "@jeng/view";
import { useState } from "react";
import type { Applied } from "..";
import type { Bridge } from "./rpc";

/**
 * What the window looks at while it is open: which config file it reads, which directory it
 * works in, and which conversations it has already had. The first two are a click rather than
 * a launch flag, because a window started from an app launcher was never handed either.
 *
 * Applying any of them rebuilds the agent, so the conversation behind this is gone by the
 * time it closes. A config or a session that cannot be opened leaves the window where it
 * was, which is why the reason is said here rather than swallowed.
 */
export function Picker({
    bridge,
    configs,
    sessions,
    state,
    onConfigs,
    onClose,
}: {
    bridge: Bridge;
    configs: string[];
    /** What the home in force has written down, read by the window when this was opened. */
    sessions: SessionRef[];
    state: State;
    onConfigs: (configs: string[]) => void;
    onClose: () => void;
}) {
    const [error, setError] = useState<string>();

    // Applying something leaves the picker up, because the working directory, the config
    // and the session are all one decision and closing on the first of them would make
    // picking the rest of it a fight. Only `close` and `esc` put it away. What a change
    // brings back is the list and, when something was refused, why.
    const report = (result: Applied) => {
        onConfigs(result.configs);
        if (result.ok) setError(undefined);
        else setError(result.error);
    };

    // A dialog that fails outright rejects rather than answering, and a rejected promise
    // with nothing waiting on it says nothing at all.
    const failed = (thrown: unknown) =>
        setError(thrown instanceof Error ? thrown.message : String(thrown));

    return (
        <div className="sheet">
            <div className="card picker">
                <h3>config</h3>
                <p className="ask">where the homes and the model come from</p>
                <div className="rows">
                    <div className="row">
                        <button
                            type="button"
                            className={state.config ? "pick" : "pick picked"}
                            onClick={() => void bridge.set(null, state.cwd).then(report, failed)}
                        >
                            no config file, read the environment
                        </button>
                    </div>
                    {configs.map((path) => (
                        <div className="row" key={path}>
                            <button
                                type="button"
                                className={path === state.config ? "pick picked" : "pick"}
                                onClick={() =>
                                    void bridge.set(path, state.cwd).then(report, failed)
                                }
                            >
                                {place(path, state.cwd)}
                            </button>
                            {/* The config in force cannot be forgotten while it is in
                             * force, which would mean applying no config at all. */}
                            {path !== state.config && (
                                <button
                                    type="button"
                                    className="aside"
                                    onClick={() =>
                                        void bridge
                                            .forget(path)
                                            .then((result) => onConfigs(result.configs))
                                    }
                                >
                                    forget
                                </button>
                            )}
                        </div>
                    ))}
                    <div className="row">
                        <button
                            type="button"
                            className="pick"
                            onClick={() => void bridge.browseConfig().then(report, failed)}
                        >
                            add a config file…
                        </button>
                    </div>
                </div>

                <h3>working directory</h3>
                <p className="ask">where it looks for AGENTS.md, and what a gadget runs in</p>
                <div className="row">
                    <span className="pick">{state.cwd}</span>
                    <button
                        type="button"
                        className="aside"
                        onClick={() => void bridge.browseCwd().then(report, failed)}
                    >
                        change…
                    </button>
                </div>

                <h3>sessions</h3>
                <p className="ask">conversations this home has already had, newest first</p>
                <div className="rows">
                    {sessions.length === 0 && <span className="pick">no sessions yet</span>}
                    {sessions.map((session) => (
                        <div className="row" key={session.id}>
                            <button
                                type="button"
                                className="pick"
                                onClick={() =>
                                    void bridge.resume(session.id).then((result) => {
                                        report(result);
                                        // A conversation that could not be opened is left
                                        // in front of the user rather than thrown away.
                                        if (result.ok) onClose();
                                    }, failed)
                                }
                            >
                                {/* A session is named by when it happened, which is what a
                                 * list of them is read by, and by what it was about. */}
                                {`${new Date(session.updated).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}  ${session.title || "nothing said yet"}`}
                            </button>
                        </div>
                    ))}
                </div>

                {error && <p className="failed">{error}</p>}

                <div className="row">
                    <button type="button" onClick={onClose}>
                        close
                    </button>
                </div>
            </div>
        </div>
    );
}
