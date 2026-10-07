import { describe, expect, test } from "bun:test";
import type { Approval } from "@jeng/core";
import type { State } from "@jeng/view";
import { renderToStaticMarkup } from "react-dom/server";

import { App } from "../../src/view/app";
import type { Bridge } from "../../src/view/rpc";

const quiet: State = {
    entries: [],
    asks: [],
    approval: undefined,
    busy: false,
    tokens: 0,
    mode: "learn",
    thinking: false,
    homes: ["/home/jeng"],
    model: "test-model",
    cwd: "/work/jeng",
    config: "/home/jeng/jeng.json",
    agents: [],
};

/** A window that is only ever looked at, because nothing here has a transport. */
const still = (state: State): Bridge =>
    ({
        get: () => state,
        subscribe: () => () => {},
        hello: async () => [],
        set: async () => ({ ok: true, configs: [] }),
        forget: async () => ({ ok: true, configs: [] }),
        browseConfig: async () => ({ ok: true, configs: [] }),
        browseCwd: async () => ({ ok: true, configs: [] }),
        send: async () => ({ sent: true }),
        interrupt: async () => {},
        clear: async () => {},
        setMode: async () => {},
        toggleThinking: async () => {},
        answer: async () => {},
        abandon: async () => {},
        decide: async () => {},
    }) as unknown as Bridge;

const shown = (state: State) => renderToStaticMarkup(<App bridge={still(state)} />);

const approval: Approval = {
    kind: "create gadget",
    name: "greet",
    source: "export default async () => 1",
    reason: "",
};

describe("the window", () => {
    test("says which homes and which model it is talking to", () => {
        const markup = shown(quiet);

        expect(markup).toContain("/home/jeng");
        expect(markup).toContain("test-model");
    });

    test("says which directory it is working in and which config says so", () => {
        const markup = shown(quiet);

        expect(markup).toContain("/work/jeng");
        expect(markup).toContain("/home/jeng/jeng.json");
    });

    test("says it is reading the environment when there is no config file", () => {
        expect(shown({ ...quiet, config: undefined })).toContain("environment");
    });

    test("says a config and a home inside the cwd relative to it, because it just said where that is", () => {
        const inside = shown({
            ...quiet,
            config: "/work/jeng/jeng.json",
            homes: ["/work/jeng/.jeng"],
        });

        expect(inside).not.toContain("/work/jeng/jeng.json");
        expect(inside).toContain(">jeng.json</button>");
        expect(inside).toContain(">.jeng</span>");
    });

    test("says which mode it is in, because that decides what jeng may do", () => {
        expect(shown(quiet)).toContain("learn");
        expect(shown({ ...quiet, mode: "work" })).toContain("work");
    });

    test("says how much of the context the model is working with", () => {
        expect(shown({ ...quiet, tokens: 4096 })).toContain("4.1k tokens");
    });

    test("says escape is there to interrupt when nothing is being asked", () => {
        expect(shown(quiet)).toContain("esc interrupt");
    });

    test("says it is thinking rather than showing a spinner for nothing", () => {
        expect(shown({ ...quiet, busy: true })).toContain("thinking");
    });

    test("says it is waiting rather than thinking when a form is up", () => {
        const ask = {
            id: 1,
            draw: {
                surface: "gui" as const,
                id: 1,
                file: "/home/jeng/gadgets/review.tsx",
                props: { diff: "a" },
            },
            resolve: () => {},
        };

        expect(shown({ ...quiet, busy: true, asks: [ask] })).toContain("waiting for you");
    });

    test("spins under the last thing said while it works, rather than only saying so in the bar", () => {
        const markup = shown({
            ...quiet,
            busy: true,
            entries: [{ kind: "user", id: 1, text: "hi" }],
        });

        expect(markup).toContain('<div class="working">');
        expect(markup.indexOf('class="working"')).toBeGreaterThan(markup.indexOf("hi"));
        // Braille, so what is drawn is the spinner and not some other glyph standing in
        // for one.
        expect(markup).toMatch(/<div class="working"><span>[\u2800-\u28ff]/);
    });

    test("shows no spinner when it is not working", () => {
        expect(shown(quiet)).not.toContain("working");
    });

    test("lists the AGENTS.md files in force, because that is what makes two runs differ", () => {
        const markup = shown({
            ...quiet,
            agents: ["/work/jeng", "/home/jeng/.jeng"],
        });

        expect(markup).toContain("AGENTS.md");
        expect(markup).toContain(">▪ ./AGENTS.md</span>");
        expect(markup).toContain(">▪ /home/jeng/.jeng/AGENTS.md</span>");
    });

    test("says nothing about AGENTS.md when there is none, rather than drawing an empty list", () => {
        expect(shown(quiet)).not.toContain("AGENTS.md");
    });

    test("offers a way to clear the conversation", () => {
        expect(shown(quiet)).toContain("clear");
    });

    test("asks for the state before it draws anything, because there is no telling when it is listening", () => {
        expect(shown({ ...quiet, entries: [{ kind: "user", id: 1, text: "hi" }] })).toContain("hi");
    });

    test("puts the approval where it is answered rather than in a bar of its own", () => {
        const markup = shown({ ...quiet, approval: { id: 1, approval } });

        expect(markup).toContain("create gadget");
        expect(markup).toContain("approve");
    });

    test("draws an approval once, since the card is already the answerable copy", () => {
        const markup = shown({
            ...quiet,
            approval: { id: 1, approval },
            entries: [{ kind: "approval", id: 1, approval }],
        });

        expect(markup.match(/create gadget/g)).toHaveLength(1);
    });

    test("keeps the why inside the card, because it is the case for the source", () => {
        const markup = shown({
            ...quiet,
            approval: { id: 1, approval: { ...approval, reason: "it greets the repo" } },
        });

        expect(markup).toContain('<p class="why">it greets the repo</p>');
    });
});
