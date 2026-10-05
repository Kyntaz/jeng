import type { ApprovalDecision, Mode } from "@jeng/core";
import type { State } from "@jeng/view";
import type { RPCSchema } from "electrobun/main";

/**
 * A request with nothing to say says so with `void`, which is also what lets the window
 * call it without passing an empty object.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: an rpc with no payload is spelled void
type Nothing = void;

/**
 * What every request that touches the window's own settings answers with. A config that
 * cannot be read has to be said rather than swallowed, and the list comes back with every
 * answer so the picker never has to ask twice for the same thing.
 */
export interface Applied {
    ok: boolean;
    error?: string;
    configs: string[];
}

/**
 * The conversation lives in the main process and the window is a pure function of it,
 * so there is exactly one copy of it and nothing in the browser can decide anything.
 *
 * Everything the user can do is a request the window makes, and the one thing it is
 * told is the state, which arrives whole on every change. The window asks for it once
 * when it mounts, because there is no telling when a listener is attached, and is sent
 * everything after that.
 */
export type JengRPC = {
    bun: RPCSchema<{
        requests: {
            ready: { params: Nothing; response: { state: State; configs: string[] } };
            /**
             * Both halves are always sent, because a key that is missing would read the
             * same as one asking for no config at all.
             */
            set: { params: { config: string | null; cwd: string }; response: Applied };
            forget: { params: { path: string }; response: Applied };
            browseConfig: { params: Nothing; response: Applied };
            browseCwd: { params: Nothing; response: Applied };
            send: { params: { text: string }; response: { sent: boolean } };
            interrupt: { params: Nothing; response: Nothing };
            clear: { params: Nothing; response: Nothing };
            setMode: { params: { mode: Mode }; response: Nothing };
            toggleThinking: { params: Nothing; response: Nothing };
            answer: { params: { id: number; answers: Record<string, unknown> }; response: Nothing };
            abandon: { params: { id: number }; response: Nothing };
            decide: { params: { decision: ApprovalDecision }; response: Nothing };
        };
    }>;
    webview: RPCSchema<{
        messages: { state: State };
    }>;
};
