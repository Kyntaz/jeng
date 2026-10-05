import { describe, expect, test } from "bun:test";
import type {
    Agent,
    AgentEvent,
    Approval,
    ApprovalDecision,
    Choice,
    Draw,
    Mode,
    Widget,
} from "@jeng/core";

import { createConversation } from "../../src/conversation";

// An agent that does nothing on its own, so every test can be about the conversation
// rather than about a model.
function stubAgent() {
    const asked: Approval[] = [];
    const injected: string[] = [];
    let mode: Mode = "learn";
    let clears = 0;
    let sending: { text: string; signal?: AbortSignal } | undefined;
    let finish: ((reply: string) => void) | undefined;
    let onEvent: ((event: AgentEvent) => void) | undefined;
    let installed: (request: Approval) => Promise<ApprovalDecision> = async () => ({
        approved: true,
    });

    const agent = {
        homes: [{ dir: "/home/jeng", agents: undefined, gadgets: [], protocols: [] }],
        agents: [],
        cwd: "/work/jeng",
        model: "test-model",
        history: [],
        memory: [],
        get mode() {
            return mode;
        },
        setMode: (next: Mode) => {
            mode = next;
        },
        setApprove: (next: (request: Approval) => Promise<ApprovalDecision>) => {
            installed = async (request) => {
                asked.push(request);
                return await next(request);
            };
        },
        inject: (text: string) => injected.push(text),
        clear: () => clears++,
        send: async (
            text: string,
            options?: { signal?: AbortSignal; onEvent?: (e: AgentEvent) => void },
        ) => {
            sending = { text, signal: options?.signal };
            onEvent = options?.onEvent;
            return await new Promise<string>((resolve) => {
                finish = resolve;
            });
        },
    } as unknown as Agent;

    return {
        agent,
        asked,
        injected,
        // Read through a call rather than a property, because destructuring a getter
        // would take its value once instead of following it.
        currentMode: () => mode,
        timesCleared: () => clears,
        sending: () => sending,
        release: (reply: string) => finish?.(reply),
        /** Say something part way through the turn, the way the model streams. */
        say: (event: AgentEvent) => onEvent?.(event),
        /** The port the conversation installed on the agent, which is how a host reaches it. */
        request: (approval: Approval) => installed(approval),
    };
}

function harness(config?: string) {
    const stub = stubAgent();
    return { ...stub, talk: createConversation(stub.agent, config) };
}

const question = (name: string): Widget => ({ kind: "input", name, question: `${name}?` });

const drawn = (name: string): Draw => ({ surface: "tui", widget: question(name) });

const component = (props: Record<string, unknown>): Draw => ({
    surface: "gui",
    file: "/home/jeng/gadgets/review.tsx",
    props,
});

const answeredEntry = (talk: ReturnType<typeof createConversation>) =>
    talk.get().entries.find((entry) => entry.kind === "view");

/** The one form that is up, which is the only one a user can be looking at. */
function open(talk: ReturnType<typeof createConversation>) {
    const ask = talk.pending;
    if (!ask) throw new Error("no form is open");
    return ask;
}

describe("a gadget's interface", () => {
    test("stays open until the user answers it", async () => {
        const { talk } = harness();
        let settled = false;
        const form = talk.ask(drawn("why")).then((answers) => {
            settled = true;
            return answers;
        });

        await Promise.resolve();
        expect(settled).toBe(false);
        expect(talk.pending).toBeDefined();

        talk.answer(open(talk).id, { why: "because" });
        expect(await form).toEqual({ why: "because" });
    });

    test("resolves with nothing at all when the user walks away from it", async () => {
        const { talk } = harness();
        const form = talk.ask(drawn("why"));

        talk.abandon(open(talk).id);

        expect(await form).toEqual({});
    });

    test("is up one at a time, so the rest wait their turn", () => {
        const { talk } = harness();
        void talk.ask(drawn("first"));
        void talk.ask(drawn("second"));

        expect(talk.pending).toMatchObject({ id: 1 });
    });

    test("gives the second of two forms its own answers rather than the first one's", async () => {
        const { talk } = harness();
        const first = talk.ask(drawn("first"));
        const second = talk.ask(drawn("second"));

        talk.answer(open(talk).id, { first: "one" });

        expect(await first).toEqual({ first: "one" });
        expect(talk.pending).toMatchObject({ id: 2 });
        void second;
    });

    test("keeps what was answered in the transcript once the form is gone", async () => {
        const { talk, say, release } = harness();
        const draw = drawn("why");
        const turn = talk.send("pick one");
        await Promise.resolve();

        // A gadget asks mid-turn: the agent puts the draw in the transcript and the
        // host's port opens the form, which is the order they really arrive in.
        say({ type: "view", draw });
        const form = talk.ask(draw);
        talk.answer(open(talk).id, { why: "because" });
        release("done");
        await turn;

        expect(await form).toEqual({ why: "because" });
        expect(answeredEntry(talk)).toMatchObject({ answers: { why: "because" } });
    });

    test("leaves a widget that asks nothing out of the way rather than holding keys", async () => {
        const { talk } = harness();
        const silent: Draw = {
            surface: "tui",
            widget: { kind: "select", name: "what", question: "what?", options: [] },
        };

        expect(await talk.ask(silent)).toEqual({});
        expect(talk.pending).toBeUndefined();
    });

    test("leaves a select with nothing in it out of the way, and a widget with options in", async () => {
        const { talk } = harness();
        const options = (names: string[]): Choice[] => names.map((name) => ({ name }));
        const draw = (choices: Choice[]): Draw => ({
            surface: "tui",
            widget: { kind: "select", name: "branch", question: "which?", options: choices },
        });

        void talk.ask(draw([]));
        expect(talk.pending).toBeUndefined();

        void talk.ask(draw(options(["main"])));
        expect(talk.pending).toBeDefined();
    });

    test("always opens a form for a component, because what it draws is its own business", async () => {
        const { talk } = harness();
        void talk.ask(component({ diff: "" }));

        expect(talk.pending).toMatchObject({ draw: { surface: "gui" } });
    });

    test("is settled by clearing rather than waiting on a transcript that is gone", async () => {
        const { talk } = harness();
        const form = talk.ask(drawn("why"));

        talk.clear();

        expect(await form).toEqual({});
        expect(talk.get().entries).toEqual([]);
    });
});

describe("escape", () => {
    test("abandons a form rather than cutting a turn short", async () => {
        const { talk } = harness();
        const form = talk.ask(drawn("why"));

        talk.escape();

        expect(await form).toEqual({});
    });

    test("turns down an approval when nothing is being asked", async () => {
        const { talk, asked, request } = harness();
        const decision = request({
            kind: "delete gadget",
            name: "greet",
            source: "",
            reason: "",
        });

        talk.escape();

        expect(await decision).toEqual({ approved: false, reason: "interrupted" });
        expect(asked).toHaveLength(1);
    });

    test("does nothing at all when there is nothing to interrupt", () => {
        const { talk } = harness();

        talk.escape();

        expect(talk.pending).toBeUndefined();
        expect(talk.get().approval).toBeUndefined();
    });
});

describe("an approval", () => {
    const asked: Approval = {
        kind: "create gadget",
        name: "greet",
        source: "/**\n * name: greet\n */\n",
        reason: "so i can say hi",
    };

    test("is put in the transcript as well as wherever it is answered", () => {
        const { talk, request } = harness();
        void request(asked);

        expect(talk.get().entries).toContainEqual({ kind: "approval", approval: asked });
        expect(talk.get().approval).toEqual(asked);
    });

    test("records what the user said as the user's own line", async () => {
        const { talk, request } = harness();
        const decision = request(asked);

        talk.decide({ approved: false, reason: "not that one" });

        expect(await decision).toEqual({ approved: false, reason: "not that one" });
        expect(talk.get().entries.at(-1)).toEqual({
            kind: "user",
            text: "rejected: not that one",
        });
    });

    test("records an approval without a reason as an approval", async () => {
        const { talk, request } = harness();
        const decision = request(asked);

        talk.decide({ approved: true });

        expect(await decision).toEqual({ approved: true });
        expect(talk.get().approval).toBeUndefined();
    });
});

describe("a turn", () => {
    test("reaches the model with what was typed", async () => {
        const { talk, sending, release } = harness();
        const turn = talk.send("what files are in src?");

        await Promise.resolve();
        expect(sending()?.text).toBe("what files are in src?");

        release("three");
        await turn;
    });

    test("reaches the model with a second message rather than starting a second turn", async () => {
        const { talk, injected, release } = harness();
        const turn = talk.send("first");
        await Promise.resolve();

        await talk.send("second");

        expect(injected).toEqual(["second"]);
        release("done");
        await turn;
    });

    test("goes back to being idle once it is over", async () => {
        const { talk, release } = harness();
        const turn = talk.send("hi");
        await Promise.resolve();

        release("hello");
        await turn;

        expect(talk.get().busy).toBe(false);
    });

    test("says nothing twice when the answer already streamed into the transcript", async () => {
        const { talk, say, release } = harness();
        const turn = talk.send("hi");
        await Promise.resolve();

        say({ type: "text", text: "hello" });
        release("hello");
        await turn;

        expect(talk.get().entries.filter((entry) => entry.kind === "jeng")).toHaveLength(1);
    });

    test("says the answer again when it is not what was streamed", async () => {
        const { talk, say, release } = harness();
        const turn = talk.send("hi");
        await Promise.resolve();

        say({ type: "text", text: "one thing" });
        release("another");
        await turn;

        expect(talk.get().entries.at(-1)).toEqual({
            kind: "jeng",
            text: "another",
            mode: "learn",
        });
    });

    test("records an interrupted turn rather than leaving it half finished", async () => {
        const { talk, sending, release } = harness();
        const turn = talk.send("hi");
        await Promise.resolve();

        talk.escape();
        expect(sending()?.signal?.aborted).toBe(true);

        release("never mind");
        await turn;
    });
});

describe("which agent this is", () => {
    test("names the directory it is working in", () => {
        const { talk } = harness();

        expect(talk.get().cwd).toBe("/work/jeng");
    });

    test("names the config file behind the homes and the model", () => {
        const { talk } = harness("/home/jeng/jeng.json");

        expect(talk.get().config).toBe("/home/jeng/jeng.json");
    });

    test("has no config to name when the environment was read instead", () => {
        const { talk } = harness();

        expect(talk.get().config).toBeUndefined();
    });
});

describe("the mode", () => {
    test("changes on the agent as well as here, since the agent is what reads it", () => {
        const { talk, currentMode } = harness();

        talk.toggleMode();

        expect(talk.get().mode).toBe("work");
        expect(currentMode()).toBe("work");
    });

    test("goes back to learn rather than sticking", () => {
        const { talk } = harness();

        talk.toggleMode();
        talk.toggleMode();

        expect(talk.get().mode).toBe("learn");
    });
});

describe("the thinking toggle", () => {
    test("flips on and off", () => {
        const { talk } = harness();

        talk.toggleThinking();
        expect(talk.get().thinking).toBe(true);

        talk.toggleThinking();
        expect(talk.get().thinking).toBe(false);
    });
});

describe("a subscriber", () => {
    test("is told about every change", async () => {
        const { talk, release } = harness();
        let told = 0;
        talk.subscribe(() => told++);

        const turn = talk.send("hi");
        await Promise.resolve();
        release("hello");
        await turn;

        expect(told).toBeGreaterThan(1);
    });

    test("stops being told once it has unsubscribed", () => {
        const { talk } = harness();
        let told = 0;
        const off = talk.subscribe(() => told++);

        off();
        talk.toggleThinking();

        expect(told).toBe(0);
    });
});
