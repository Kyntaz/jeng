import type { ApprovalDecision, Mode } from "@jeng/core";
import type { State } from "@jeng/view";
import { Electroview } from "electrobun/view";
import type { JengRPC } from "..";

/**
 * The window's half of the bridge. It asks for the state once and is handed every
 * change after that, so the whole app is a rendering of one value that lives in the
 * main process and cannot be argued with from here. The configs it has been shown come
 * back with that first ask rather than on their own, so opening the picker is not a
 * second thing that has to be waited on.
 */
export function connect() {
    const rpc = Electroview.defineRPC<JengRPC>({
        // Electrobun gives up on a request after a second, which is shorter than opening a
        // file dialog or loading a home off a slow disk takes. Nothing here is unbounded
        // the way a turn is: every request answers or fails.
        maxRequestTime: Infinity,
        handlers: { requests: {}, messages: {} },
    });
    // The window keeps the transport alive through its own global, so this is not held.
    new Electroview({ rpc });

    let state: State | undefined;
    const listeners = new Set<() => void>();

    const receive = (next: State) => {
        state = next;
        for (const listener of listeners) listener();
    };

    rpc.addMessageListener("state", receive);

    return {
        get: (): State | undefined => state,
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        // There is no telling when a listener is attached, so the window asks for the state
        // rather than waiting to be handed it: the answer is the first state, and the
        // messages that follow are every change after it.
        hello: () =>
            rpc.request.ready().then((first) => {
                receive(first.state);
                return first.configs;
            }),
        set: (config: string | null, cwd: string) => rpc.request.set({ config, cwd }),
        forget: (path: string) => rpc.request.forget({ path }),
        browseConfig: () => rpc.request.browseConfig(),
        browseCwd: () => rpc.request.browseCwd(),
        send: (text: string) => rpc.request.send({ text }),
        interrupt: () => rpc.request.interrupt(),
        clear: () => rpc.request.clear(),
        setMode: (mode: Mode) => rpc.request.setMode({ mode }),
        toggleThinking: () => rpc.request.toggleThinking(),
        answer: (id: number, answers: Record<string, unknown>) =>
            rpc.request.answer({ id, answers }),
        abandon: (id: number) => rpc.request.abandon({ id }),
        decide: (decision: ApprovalDecision) => rpc.request.decide({ decision }),
    };
}

export type Bridge = ReturnType<typeof connect>;
