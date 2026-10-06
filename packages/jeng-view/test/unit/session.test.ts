import { describe, expect, test } from "bun:test";
import type { Agent, Draw, Mode, Widget } from "@jeng/core";
import { createConversation } from "../../src/conversation";
import type { Session } from "../../src/session";
import type { Entry } from "../../src/transcript";

// An agent that does nothing on its own, so every test here is about the session rather
// than about a model. Its history and memory are added to in place and emptied on a clear,
// the way a real one's are, because that is what a record has to be taken against.
function stubAgent() {
    let mode: Mode = "learn";
    const history: { role: string; content: string }[] = [];
    const memory: { name: string; body: string }[] = [];

    const agent = {
        homes: [{ dir: "/home/jeng", agents: undefined, gadgets: [], protocols: [] }],
        agents: [],
        cwd: "/work/jeng",
        model: "test-model",
        history,
        memory,
        get mode() {
            return mode;
        },
        setMode: (next: Mode) => {
            mode = next;
        },
        setApprove: () => {},
        setUi: (_widget: Widget) => {},
        setGui: (_draw: Draw) => {},
        inject: () => {},
        clear: () => {
            history.length = 0;
            memory.length = 0;
        },
        send: async (text: string) => {
            history.push({ role: "user", content: text });
            return "done";
        },
    } as unknown as Agent;

    return { agent, history, memory };
}

const session = (over: Partial<Session> = {}): Session => ({
    id: "2026-10-06T14-02-11",
    title: "what files are in src?",
    started: "2026-10-06T14:02:11.204Z",
    updated: "2026-10-06T14:19:02.881Z",
    cwd: "/work/jeng",
    homes: ["/home/jeng"],
    mode: "learn",
    thinking: false,
    tokens: 1200,
    history: [],
    memory: [],
    entries: [],
    ...over,
});

/** What the conversation writes down, one record per time it was asked to. */
function keeper() {
    const written: Session[] = [];
    let named = 0;
    return {
        written,
        names: () => named,
        port: {
            name: () => `session-${++named}`,
            save: (record: Session) => {
                written.push(record);
            },
        },
    };
}

const asked: Entry[] = [{ kind: "user", id: 7, text: "what files are in src?" }];

describe("a conversation that is written down", () => {
    test("picks the transcript up rather than starting empty", () => {
        const { agent } = stubAgent();

        const talk = createConversation(agent, undefined, {
            resume: session({ entries: asked, tokens: 1200 }),
            name: () => "unused",
            save: () => {},
        });

        expect(talk.get().entries).toEqual(asked);
    });

    test("counts on from the rows it picked up rather than over them", async () => {
        const { agent } = stubAgent();
        const talk = createConversation(agent, undefined, {
            resume: session({ entries: asked }),
            name: () => "unused",
            save: () => {},
        });

        await talk.send("and again");

        // A window rebuilds its rows from the number they were given, so two rows sharing
        // one number is one row that tears itself down and goes back up on every word.
        expect(talk.get().entries.map((entry) => entry.id)).toEqual([7, 8, 9]);
    });

    test("keeps the context the header counts out of", () => {
        const { agent } = stubAgent();

        const talk = createConversation(agent, undefined, {
            resume: session({ tokens: 1200 }),
            name: () => "unused",
            save: () => {},
        });

        expect(talk.get().tokens).toBe(1200);
    });

    test("says what it is holding right now, whether or not anyone has written it down", () => {
        const { agent } = stubAgent();

        expect(createConversation(agent).session).toMatchObject({
            cwd: "/work/jeng",
            homes: ["/home/jeng"],
        });
    });

    test("is written down every few exchanges, so a run killed outright loses little", async () => {
        const { agent } = stubAgent();
        const { written, port } = keeper();
        const talk = createConversation(agent, undefined, port);

        for (const one of ["one", "two", "three", "four", "five"]) await talk.send(one);

        expect(written).toHaveLength(1);
    });

    test("says what it is about, which is the only thing a list of them can show", async () => {
        const { agent } = stubAgent();
        const { written, port } = keeper();
        const talk = createConversation(agent, undefined, port);

        for (const one of ["one", "two", "three", "four", "five"]) await talk.send(one);

        expect(written[0].title).toBe("one");
    });

    test("is written down before it is cleared, since the clear is what loses it", async () => {
        const { agent } = stubAgent();
        const { written, port } = keeper();
        const talk = createConversation(agent, undefined, port);

        await talk.send("what files are in src?");
        talk.clear();

        expect(written).toHaveLength(1);
        expect(written[0].history).toEqual([{ role: "user", content: "what files are in src?" }]);
    });

    test("takes a new name after a clear, so what came before stays loadable", () => {
        const { agent } = stubAgent();
        const { port } = keeper();
        const talk = createConversation(agent, undefined, port);

        const before = talk.session.id;
        talk.clear();

        expect(talk.session.id).not.toBe(before);
    });

    test("is written down on the way out, which is the save worth the most", () => {
        const { agent } = stubAgent();
        const { written, port } = keeper();
        const talk = createConversation(agent, undefined, port);

        talk.save();

        expect(written).toHaveLength(1);
    });

    test("carries the protocols it had committed, since memory is not the transcript", () => {
        const { agent, memory } = stubAgent();
        memory.push({ name: "deploy", body: "run make" });
        const { written, port } = keeper();
        const talk = createConversation(agent, undefined, port);

        talk.save();

        expect(written[0].memory).toEqual([{ name: "deploy", body: "run make" }]);
    });

    test("says when it could not be written rather than losing the screen over it", () => {
        const { agent } = stubAgent();
        const talk = createConversation(agent, undefined, {
            name: () => "session-1",
            save: () => {
                throw new Error("the disk is full");
            },
        });

        talk.save();

        expect(talk.get().entries).toContainEqual({
            kind: "error",
            id: 1,
            icon: "err",
            text: "session not saved: the disk is full",
        });
    });

    test("does nothing about sessions at all when there is nowhere to keep them", () => {
        const { agent } = stubAgent();
        const talk = createConversation(agent);

        talk.save();
        talk.clear();

        expect(talk.get().entries).toEqual([]);
    });
});
