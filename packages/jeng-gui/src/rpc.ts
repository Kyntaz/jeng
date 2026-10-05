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
            ready: { params: Nothing; response: State };
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
