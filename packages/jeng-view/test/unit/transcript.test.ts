import { describe, expect, test } from "bun:test";
import type { Draw, Widget } from "@jeng/core";

import { append, blank, type Entry, isAsk, QUIET } from "../../src/transcript";

const drawn = (widget: Widget): Draw => ({ surface: "tui", widget });

describe("entries", () => {
    test("keeps a run of streamed text as one jeng entry", () => {
        const first = append([], { type: "text", text: "hel" }, "learn", 1);
        const second = append(first, { type: "text", text: "lo" }, "learn", 2);

        expect(second).toEqual([{ kind: "jeng", id: 1, text: "hello", mode: "learn" }]);
    });

    test("holds a row's number while a reply grows, since a window builds rows by number", () => {
        const first = append([], { type: "text", text: "hel" }, "learn", 7);
        const second = append(first, { type: "text", text: "lo" }, "learn", 8);
        const third = append(second, { type: "text", text: "!" }, "learn", 9);

        expect(third.map((entry) => entry.id)).toEqual([7]);
    });

    test("opens a new jeng entry when a tool interrupts the stream", () => {
        const entries = append(
            [{ kind: "jeng", id: 1, text: "one", mode: "learn" }],
            { type: "tool", action: "read", args: { path: "a.txt", action: "read" } },
            "learn",
            2,
        );

        expect(entries.at(-1)).toEqual({
            kind: "tool",
            id: 2,
            icon: "⚙",
            text: "read path=a.txt",
            mode: "learn",
        });
    });

    test("leaves no gap behind a call that takes no arguments", () => {
        const entries = append(
            [],
            { type: "tool", action: "compact", args: { action: "compact" } },
            "learn",
            1,
        );

        expect(entries).toEqual([
            { kind: "tool", id: 1, icon: "⚙", text: "compact", mode: "learn" },
        ]);
    });

    test("draws no box for an end, whose answer is the box that follows it", () => {
        const entries = append(
            [{ kind: "tool", id: 1, icon: "⚙", text: "read path=a.txt", mode: "learn" }],
            { type: "tool", action: "end", args: { content: "three files" } },
            "learn",
            2,
        );

        expect(entries).toEqual([
            { kind: "tool", id: 1, icon: "⚙", text: "read path=a.txt", mode: "learn" },
        ]);
    });

    test("serializes args that are not strings as json", () => {
        const entries = append(
            [],
            { type: "tool", action: "run", args: { lines: [1, 2] } },
            "learn",
            1,
        );

        expect(entries).toEqual([
            { kind: "tool", id: 1, icon: "⚙", text: "run lines=[1,2]", mode: "learn" },
        ]);
    });

    test("cuts the args off so a tool line stays one line", () => {
        const entries = append(
            [],
            { type: "tool", action: "run", args: { text: "x".repeat(200) } },
            "learn",
            1,
        );

        expect(entries).toEqual([
            { kind: "tool", id: 1, icon: "⚙", text: `run text=${"x".repeat(75)}`, mode: "learn" },
        ]);
    });

    test("keeps what a gadget drew as an entry of its own", () => {
        const draw = drawn({ kind: "select", name: "branch", question: "which?", options: [] });

        expect(append([], { type: "view", draw }, "learn", 1)).toEqual([
            { kind: "view", id: 1, draw, mode: "learn" },
        ]);
    });

    test("keeps a run of reasoning as one think entry", () => {
        const first = append([], { type: "reasoning", text: "may" }, "learn", 1);
        const second = append(first, { type: "reasoning", text: "be" }, "learn", 2);

        expect(second).toEqual([{ kind: "think", id: 1, text: "maybe", mode: "learn" }]);
    });

    test("does not fold reasoning into a jeng entry", () => {
        const entries = append(
            [{ kind: "jeng", id: 1, text: "hi", mode: "learn" }],
            { type: "reasoning", text: "wait" },
            "learn",
            2,
        );

        expect(entries).toEqual([
            { kind: "jeng", id: 1, text: "hi", mode: "learn" },
            { kind: "think", id: 2, text: "wait", mode: "learn" },
        ]);
    });

    test("marks what jeng said with the mode it was said in", () => {
        const entries = append([], { type: "text", text: "four" }, "work", 1);

        expect(entries).toEqual([{ kind: "jeng", id: 1, text: "four", mode: "work" }]);
    });

    test("keeps a result an arrow under the action it answers", () => {
        const entries = append([], { type: "result", content: "3 files", ok: true }, "learn", 1);

        expect(entries.at(-1)).toEqual({
            kind: "output",
            id: 1,
            icon: "↳",
            text: "3 files",
            mode: "learn",
        });
    });

    test("tells an action that failed apart from one that returned something", () => {
        const entries = append(
            [],
            { type: "result", content: "no such file", ok: false },
            "learn",
            1,
        );

        expect(entries.at(-1)).toEqual({
            kind: "failure",
            id: 1,
            icon: "↳",
            text: "no such file",
            mode: "learn",
        });
    });

    test("holds back only what the toggle reveals", () => {
        expect(QUIET).toEqual(["think", "output", "error"]);
    });

    test("ignores usage, which is a number and not a line", () => {
        const entries: Entry[] = [{ kind: "jeng", id: 1, text: "hi", mode: "learn" }];

        expect(append(entries, { type: "usage", promptTokens: 12 }, "learn", 2)).toEqual(entries);
    });

    test("reads a message that is nothing but spaces as no message", () => {
        expect(blank({ kind: "jeng", id: 1, text: " \n ", mode: "learn" })).toBe(true);
    });

    test("reads a message with words in it as a message", () => {
        expect(blank({ kind: "jeng", id: 1, text: "hi", mode: "learn" })).toBe(false);
    });

    test("reads a gadget that only draws blank content as nothing to draw", () => {
        const draw = drawn({
            kind: "box",
            direction: "col",
            children: [
                { kind: "markdown", content: "" },
                { kind: "box", direction: "col", children: [{ kind: "code", content: "  " }] },
            ],
        });

        expect(blank({ kind: "view", id: 1, draw, mode: "learn" })).toBe(true);
    });

    test("reads a gadget that asks something as something to draw", () => {
        const draw = drawn({ kind: "input", name: "message", question: "which?" });

        expect(blank({ kind: "view", id: 1, draw, mode: "learn" })).toBe(false);
    });

    test("never reads a component as blank, since there is no telling what it draws", () => {
        const draw: Draw = {
            surface: "gui",
            id: 1,
            file: "/gadgets/review.tsx",
            props: { diff: "" },
        };

        expect(blank({ kind: "view", id: 1, draw, mode: "learn" })).toBe(false);
    });

    test("never reads an approval as blank, since the user has to read it", () => {
        const approval = { kind: "create gadget", name: "g", source: "", reason: "" } as const;

        expect(blank({ kind: "approval", id: 1, approval })).toBe(false);
    });
});

describe("a form and the ask that opened it", () => {
    const asked = (id: number, file: string, props: Record<string, unknown>) =>
        ({ id, draw: { surface: "gui", id, file, props } }) as const;

    test("recognises the form even after a window has read it as JSON", () => {
        // What the window is actually handed: two equal objects where there used to be one
        // shared one. Going by identity here is what left a gadget with no way to answer.
        const [entry, ask] = JSON.parse(
            JSON.stringify([
                {
                    kind: "view",
                    id: 1,
                    draw: asked(1, "/g.tsx", { diff: "a" }).draw,
                    mode: "learn",
                },
                asked(1, "/g.tsx", { diff: "a" }),
            ]),
        ) as [Entry, ReturnType<typeof asked>];

        expect(isAsk(entry, ask)).toBe(true);
    });

    test("tells two forms apart even when a gadget is asked the same thing twice", () => {
        const props = { diff: "a" };

        expect(
            isAsk(
                { kind: "view", id: 1, draw: asked(1, "/g.tsx", props).draw, mode: "learn" },
                asked(2, "/g.tsx", props),
            ),
        ).toBe(false);
    });

    test("still reads a widget tree as itself, which the terminal needs and JSON never sees", () => {
        const widget = { kind: "text", content: "which?" } as const;
        const entry: Entry = { kind: "view", id: 1, draw: drawn(widget), mode: "learn" };

        expect(isAsk(entry, { draw: entry.draw })).toBe(true);
        expect(isAsk(entry, { draw: drawn({ ...widget }) })).toBe(false);
    });
});
