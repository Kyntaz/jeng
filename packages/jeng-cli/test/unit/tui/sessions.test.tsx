import { describe, expect, test } from "bun:test";
import type { Agent, AgentEvent, Mode, SessionRef } from "@jeng/core";
import { createConversation } from "@jeng/view";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App, type Run } from "../../../src/tui/app";

function stubAgent(answer = "done"): Agent {
    let mode: Mode = "learn";
    return {
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
        setApprove: () => {},
        setUi: () => {},
        setGui: () => {},
        inject: () => {},
        clear: () => {},
        send: async (_prompt: string, options?: { onEvent?: (event: AgentEvent) => void }) => {
            options?.onEvent?.({ type: "text", text: answer, reply: 0 });
            return answer;
        },
    } as unknown as Agent;
}

const session = (id: string, title: string): SessionRef => ({
    id,
    title,
    started: "2026-10-06T14:02:11.204Z",
    updated: "2026-10-06T14:19:02.881Z",
    file: `/home/jeng/sessions/${id}.json`,
});

const AFTERNOON = "2026-10-06T14-02-11.204";
const MORNING = "2026-10-06T09-02-11.005";

/** A run with two conversations already written down behind it, and a record of what was picked. */
function started(sessions: SessionRef[], loaded: string[] = []) {
    const agent = stubAgent();
    const current: Run = {
        agent,
        talk: createConversation(agent),
        home: "/home/jeng",
        sessions: () => sessions,
    };

    return {
        run: current,
        // What the host does: the run being left is written down, and the one being opened
        // takes its place.
        resume: async (id: string) => {
            loaded.push(id);
            current.talk.save();
            return { ...current, sessions: () => sessions };
        },
        agent,
    };
}

async function render(sessions: SessionRef[], loaded: string[] = []) {
    const props = started(sessions, loaded);
    return {
        ...props,
        ...(await testRender(<App run={props.run} resume={props.resume} onExit={() => {}} />, {
            width: 80,
            height: 24,
            kittyKeyboard: true,
        })),
    };
}

describe("picking a session in the tui", () => {
    test("opens on ctrl+p and lists what the home has written down", async () => {
        const { mockInput, flush, captureCharFrame } = await render([
            session(AFTERNOON, "what files are in src?"),
            session(MORNING, "deploy the thing"),
        ]);

        act(() => mockInput.pressKey("p", { ctrl: true }));
        await act(async () => await flush());

        const frame = captureCharFrame();
        expect(frame).toContain("what files are in src?");
        expect(frame).toContain("deploy the thing");
    });

    test("says so when there is nothing to pick yet", async () => {
        const { mockInput, flush, captureCharFrame } = await render([]);

        act(() => mockInput.pressKey("p", { ctrl: true }));
        await act(async () => await flush());

        expect(captureCharFrame()).toContain("no sessions yet");
    });

    test("puts the keys it answers to in the footer while it is up", async () => {
        const { mockInput, flush, captureCharFrame } = await render([]);

        act(() => mockInput.pressKey("p", { ctrl: true }));
        await act(async () => await flush());

        expect(captureCharFrame()).toContain("enter load");
    });

    test("puts the run being left down before the one being opened takes over", async () => {
        const loaded: string[] = [];
        const { mockInput, flush } = await render(
            [session(AFTERNOON, "what files are in src?")],
            loaded,
        );

        act(() => mockInput.pressKey("p", { ctrl: true }));
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());

        expect(loaded).toEqual([AFTERNOON]);
    });

    test("says a session it could not open rather than losing the list", async () => {
        const agent = stubAgent();
        const { renderer, mockInput, flush, captureCharFrame } = await testRender(
            <App
                run={{
                    agent,
                    talk: createConversation(agent),
                    home: "/home/jeng",
                    sessions: () => [session(AFTERNOON, "what files are in src?")],
                }}
                resume={async () => {
                    throw new Error("no session 2026-10-06T14-02-11.204 in /home/jeng/sessions");
                }}
                onExit={() => {}}
            />,
            { width: 80, height: 24, kittyKeyboard: true },
        );

        act(() => mockInput.pressKey("p", { ctrl: true }));
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("no session 2026-10-06T14-02-11.204");
    });

    test("puts it away on esc without changing anything", async () => {
        const loaded: string[] = [];
        const { mockInput, flush, captureCharFrame } = await render(
            [session(AFTERNOON, "what files are in src?")],
            loaded,
        );

        act(() => mockInput.pressKey("p", { ctrl: true }));
        await act(async () => await flush());
        act(() => mockInput.pressEscape());
        await act(async () => await flush());

        expect({
            listed: captureCharFrame().includes("what files are in src?"),
            loaded,
        }).toEqual({ listed: false, loaded: [] });
    });

    test("loads the row the highlight is on rather than the first one", async () => {
        const loaded: string[] = [];
        const { mockInput, flush } = await render(
            [session(AFTERNOON, "what files are in src?"), session(MORNING, "deploy the thing")],
            loaded,
        );

        act(() => mockInput.pressKey("p", { ctrl: true }));
        await act(async () => await flush());
        act(() => mockInput.pressArrow("down"));
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());

        expect(loaded).toEqual([MORNING]);
    });
});
