import type { State } from "@jeng/view";
import { place } from "@jeng/view/place";
import { useState } from "react";
import type { Applied } from "../rpc";
import type { Bridge } from "./rpc";

/**
 * Where the window points: which config file it reads and which directory it works in.
 * Both are a click rather than a launch flag, because a window started from an app
 * launcher was never handed either.
 *
 * Applying either one rebuilds the agent, so the conversation behind this is gone by the
 * time it closes. A config that cannot be read leaves the window where it was, which is
 * why the reason is said here rather than swallowed.
 */
export function Picker({
    bridge,
    configs,
    state,
    onConfigs,
    onClose,
}: {
    bridge: Bridge;
    configs: string[];
    state: State;
    onConfigs: (configs: string[]) => void;
    onClose: () => void;
}) {
    const [error, setError] = useState<string>();

    // Applying something leaves the picker up, because the working directory and the config
    // are two halves of the same decision and closing on the first one would make picking
    // both a fight. Only `close` and `esc` put it away. What a change brings back is the
    // list and, when something was refused, why.
    const report = (result: Applied) => {
        onConfigs(result.configs);
        if (!result.ok) setError(result.error);
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
