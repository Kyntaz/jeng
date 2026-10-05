import type { Agent, Answers, Approval, ApprovalDecision, Draw, Mode, Widget } from "@jeng/core";
import { fields } from "@jeng/core";
import { append, type Entry, isAsk } from "./transcript";

/** A gadget's interface, waiting on a user who has not answered it yet. */
export interface Ask {
    /** What tells two forms apart, since a gadget can leave more than one up. */
    id: number;
    draw: Draw;
    resolve: (answers: Record<string, unknown>) => void;
}

type TuiDraw = { surface: "tui"; widget: Widget };

export interface State {
    entries: Entry[];
    asks: Ask[];
    approval?: Approval;
    busy: boolean;
    /** One request old, which is the size of the request the model is about to make. */
    tokens: number;
    mode: Mode;
    thinking: boolean;
    /** Which agent this is, which is the one thing a window cannot work out for itself. */
    homes: string[];
    model: string;
}

export const decided = (decision: ApprovalDecision): string =>
    decision.approved ? "approved" : decision.reason ? `rejected: ${decision.reason}` : "rejected";

// A widget that asks nothing is nothing to wait for. A component always is: what it
// draws and whether it asks is the gadget's own business, and asking costs one entry.
const asks = (draw: Draw): boolean => draw.surface === "gui" || fields(draw.widget).length > 0;

/**
 * The conversation as state, with nothing in it about how any of it is drawn. A terminal
 * and a window have very little in common past this, which is the point: the rules below
 * are the ones that were hardest to get right, so they are written down once.
 */
export function createConversation(agent: Agent) {
    let state: State = {
        entries: [],
        asks: [],
        approval: undefined,
        busy: false,
        tokens: 0,
        mode: agent.mode,
        thinking: false,
        homes: agent.homes.map((home) => home.dir),
        model: agent.model,
    };
    let numbered = 0;
    let running: AbortController | undefined;
    let deciding: ((decision: ApprovalDecision) => void) | undefined;
    const listeners = new Set<() => void>();

    function set(patch: Partial<State>): void {
        state = { ...state, ...patch };
        for (const listener of listeners) listener();
    }

    // An answer belongs to the draw it came from, which is the same widget or the same
    // props the transcript entry was built from, so nothing has to be numbered to
    // find it.
    function settle(ask: Ask, answers: Record<string, unknown>): void {
        set({
            asks: state.asks.filter((it) => it !== ask),
            entries: state.entries.map((entry) =>
                isAsk(entry, ask) ? { ...entry, answers } : entry,
            ),
        });
        ask.resolve(answers);
    }

    agent.setApprove(
        (request) =>
            new Promise<ApprovalDecision>((resolve) => {
                deciding = resolve;
                // What the user is being asked to allow goes in the transcript as well as
                // wherever it is answered, so scrolling back shows the decision.
                set({
                    approval: request,
                    entries: [...state.entries, { kind: "approval", approval: request }],
                });
            }),
    );

    /**
     * Show a gadget's interface and wait to hear what the user made of it. One call is
     * one round trip, so a tree that asks nothing resolves at once rather than leaving a
     * form up that cannot be answered. A widget tree can only ever answer strings and a
     * component can answer anything, which is the difference between the two shapes.
     */
    function ask(draw: TuiDraw): Promise<Answers>;
    function ask(draw: Draw): Promise<Record<string, unknown>>;
    function ask(draw: Draw): Promise<Record<string, unknown>> {
        if (!asks(draw)) return Promise.resolve({});
        return new Promise((resolve) => {
            set({ asks: [...state.asks, { id: ++numbered, draw, resolve }] });
        });
    }

    const conversation = {
        get: (): State => state,

        /** The one form that is up. A gadget that asks without waiting leaves more. */
        get pending(): Ask | undefined {
            return state.asks[0];
        },

        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },

        ask,

        answer(id: number, answers: Record<string, unknown>): void {
            const ask = state.asks.find((it) => it.id === id);
            if (ask) settle(ask, answers);
        },

        /** Walking away from a form is an answer with nothing in it, as it is for a widget. */
        abandon(id: number): void {
            const ask = state.asks.find((it) => it.id === id);
            if (ask) settle(ask, {});
        },

        decide(decision: ApprovalDecision): void {
            deciding?.(decision);
            deciding = undefined;
            set({
                approval: undefined,
                // An answer is the user talking, so it is recorded as the user's line.
                entries: [...state.entries, { kind: "user", text: decided(decision) }],
            });
        },

        toggleThinking(): void {
            set({ thinking: !state.thinking });
        },

        toggleMode(): void {
            const next: Mode = state.mode === "learn" ? "work" : "learn";
            agent.setMode(next);
            set({ mode: next });
        },

        /** Escape reaches for whatever is holding the turn up, the user first. */
        escape(): void {
            const ask = state.asks[0];
            if (ask) conversation.abandon(ask.id);
            else if (state.approval)
                conversation.decide({ approved: false, reason: "interrupted" });
            else if (state.busy) running?.abort();
        },

        clear(): void {
            // Anything still waiting on an answer would wait forever once the transcript
            // it was drawn in is gone.
            for (const ask of state.asks) ask.resolve({});
            agent.clear();
            set({ entries: [], asks: [], tokens: 0 });
        },

        async send(text: string): Promise<void> {
            if (!text.trim()) return;
            set({ entries: [...state.entries, { kind: "user", text }] });

            // The prompt keeps working while jeng does, so a message typed mid-turn
            // reaches the model between two of its calls rather than cutting one short.
            if (state.busy) {
                agent.inject(text);
                return;
            }

            const controller = new AbortController();
            running = controller;
            set({ busy: true });
            // Read once per turn rather than per event, so a mode switched mid-turn
            // stamps the whole turn rather than splitting it in two.
            const speaking = state.mode;
            try {
                let streamed = "";
                const reply = await agent.send(text, {
                    signal: controller.signal,
                    onEvent: (event) => {
                        if (event.type === "usage") set({ tokens: event.promptTokens });
                        else {
                            if (event.type === "text") streamed += event.text;
                            set({ entries: append(state.entries, event, speaking) });
                        }
                    },
                });
                // The answer is said out loud rather than only in the transcript, so a
                // turn that ended in words the user already watched stream stays one entry.
                if (reply.trim() && reply.trim() !== streamed.trim())
                    set({
                        entries: [...state.entries, { kind: "jeng", text: reply, mode: speaking }],
                    });
            } catch (error) {
                const note = controller.signal.aborted ? "interrupted" : (error as Error).message;
                set({ entries: [...state.entries, { kind: "error", icon: "err", text: note }] });
            } finally {
                running = undefined;
                set({ busy: false });
            }
        },
    };

    return conversation;
}

export type Conversation = ReturnType<typeof createConversation>;
