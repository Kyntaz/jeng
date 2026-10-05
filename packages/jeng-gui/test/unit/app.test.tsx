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
};

/** A window that is only ever looked at, because nothing here has a transport. */
const still = (state: State): Bridge =>
    ({
        get: () => state,
        subscribe: () => () => {},
        hello: async () => state,
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

describe("the window", () => {
    test("says which homes and which model it is talking to", () => {
        const markup = shown(quiet);

        expect(markup).toContain("/home/jeng");
        expect(markup).toContain("test-model");
    });

    test("says which mode it is in, because that decides what jeng may do", () => {
        expect(shown(quiet)).toContain("learn");
        expect(shown({ ...quiet, mode: "work" })).toContain("work");
    });

    test("says how much of the context the model is working with", () => {
        expect(shown({ ...quiet, tokens: 4096 })).toContain("4096 tokens");
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
                file: "/home/jeng/gadgets/review.tsx",
                props: { diff: "a" },
            },
            resolve: () => {},
        };

        expect(shown({ ...quiet, busy: true, asks: [ask] })).toContain("waiting for you");
    });

    test("offers a way to clear the conversation", () => {
        expect(shown(quiet)).toContain("clear");
    });

    test("asks for the state before it draws anything, because there is no telling when it is listening", () => {
        expect(shown({ ...quiet, entries: [{ kind: "user", text: "hi" }] })).toContain("hi");
    });

    test("puts the approval where it is answered rather than in a bar of its own", () => {
        const approval: Approval = {
            kind: "create gadget",
            name: "greet",
            source: "export default async () => 1",
            reason: "",
        };

        const markup = shown({ ...quiet, approval });

        expect(markup).toContain("create gadget");
        expect(markup).toContain("approve");
    });
});
