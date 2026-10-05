import type { ApprovalDecision, Mode } from "@jeng/core";
import type { State } from "@jeng/view";
import { BrowserView, BrowserWindow } from "electrobun/main";
import type { JengRPC } from "../rpc";

/** Everything the window is allowed to do to the conversation. */
export interface Handle {
    ready: () => State;
    send: (text: string) => { sent: boolean };
    interrupt: () => void;
    clear: () => void;
    setMode: (mode: Mode) => void;
    toggleThinking: () => void;
    answer: (id: number, answers: Record<string, unknown>) => void;
    abandon: (id: number) => void;
    decide: (decision: ApprovalDecision) => void;
}

/**
 * The window is a view of the conversation and nothing more. It asks the main process
 * to do things and is handed the whole state in return, so there is no state here that
 * could disagree with the agent's.
 */
export function openWindow(url: string, handle: Handle) {
    const rpc = BrowserView.defineRPC<JengRPC>({
        handlers: {
            requests: {
                ready: () => handle.ready(),
                send: ({ text }) => handle.send(text),
                interrupt: () => handle.interrupt(),
                clear: () => handle.clear(),
                setMode: ({ mode }) => handle.setMode(mode),
                toggleThinking: () => handle.toggleThinking(),
                answer: ({ id, answers }) => handle.answer(id, answers),
                abandon: ({ id }) => handle.abandon(id),
                decide: ({ decision }) => handle.decide(decision),
            },
            messages: {},
        },
    });

    const window = new BrowserWindow({
        title: "Jeng",
        url,
        frame: { width: 1100, height: 760 },
        rpc,
    });

    return {
        state: (next: State) => rpc.send.state(next),
        onClose: (handler: () => void) => window.on("close", handler),
    };
}
