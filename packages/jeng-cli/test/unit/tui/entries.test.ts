import { describe, expect, test } from "bun:test";
import type { Widget } from "@jeng/core";
import { append, approvalText, type Entry } from "../../../src/tui/entries";

const GADGET = {
    kind: "create gadget",
    name: "greet",
    source: "/**\n * name: greet\n */\n\nexport default async () => 'hi'\n",
    reason: "so i can say hi",
} as const;

describe("entries", () => {
    test("keeps a run of streamed text as one jeng entry", () => {
        const first = append([], { type: "text", text: "hel" }, "learn");
        const second = append(first, { type: "text", text: "lo" }, "learn");

        expect(second).toEqual([{ kind: "jeng", text: "hello", mode: "learn" }]);
    });

    test("opens a new jeng entry when a tool interrupts the stream", () => {
        const entries = append(
            [{ kind: "jeng", text: "one", mode: "learn" }],
            { type: "tool", action: "read", args: { path: "a.txt", action: "read" } },
            "learn",
        );

        expect(entries.at(-1)).toEqual({
            kind: "tool",
            icon: "⚙",
            text: "read path=a.txt",
            mode: "learn",
        });
    });

    test("leaves no gap behind a call that takes no arguments", () => {
        const entries = append(
            [],
            { type: "tool", action: "end", args: { action: "end" } },
            "learn",
        );

        expect(entries).toEqual([{ kind: "tool", icon: "⚙", text: "end", mode: "learn" }]);
    });

    test("serializes args that are not strings as json", () => {
        const entries = append(
            [],
            { type: "tool", action: "run", args: { lines: [1, 2] } },
            "learn",
        );

        expect(entries).toEqual([
            { kind: "tool", icon: "⚙", text: "run lines=[1,2]", mode: "learn" },
        ]);
    });

    test("cuts the args off so a tool line stays one line", () => {
        const entries = append(
            [],
            { type: "tool", action: "run", args: { text: "x".repeat(200) } },
            "learn",
        );

        expect(entries).toEqual([
            { kind: "tool", icon: "⚙", text: `run text=${"x".repeat(75)}`, mode: "learn" },
        ]);
    });

    test("keeps a widget a gadget drew as an entry of its own", () => {
        const widget: Widget = { kind: "select", name: "branch", question: "which?", options: [] };

        expect(append([], { type: "view", widget }, "learn")).toEqual([
            { kind: "view", widget, mode: "learn" },
        ]);
    });

    test("keeps a run of reasoning as one think entry", () => {
        const first = append([], { type: "reasoning", text: "may" }, "learn");
        const second = append(first, { type: "reasoning", text: "be" }, "learn");

        expect(second).toEqual([{ kind: "think", text: "maybe", mode: "learn" }]);
    });

    test("does not fold reasoning into a jeng entry", () => {
        const entries = append(
            [{ kind: "jeng", text: "hi", mode: "learn" }],
            { type: "reasoning", text: "wait" },
            "learn",
        );

        expect(entries).toEqual([
            { kind: "jeng", text: "hi", mode: "learn" },
            { kind: "think", text: "wait", mode: "learn" },
        ]);
    });

    test("marks what jeng said with the mode it was said in", () => {
        const entries = append([], { type: "text", text: "four" }, "work");

        expect(entries).toEqual([{ kind: "jeng", text: "four", mode: "work" }]);
    });

    test("keeps a result an arrow under the action it answers", () => {
        const entries = append([], { type: "result", content: "3 files", ok: true }, "learn");

        expect(entries.at(-1)).toEqual({
            kind: "tool",
            icon: "↳",
            text: "3 files",
            mode: "learn",
        });
    });

    test("ignores usage, which is a number and not a line", () => {
        const entries: Entry[] = [{ kind: "jeng", text: "hi", mode: "learn" }];

        expect(append(entries, { type: "usage", promptTokens: 12 }, "learn")).toEqual(entries);
    });

    test("shows the user the whole source they are being asked to allow", () => {
        expect(approvalText(GADGET)).toContain("export default async () => 'hi'");
    });

    test("names the gadget and the reason it is wanted", () => {
        const text = approvalText(GADGET);

        expect(text).toContain("create gadget `greet`");
        expect(text).toContain("why: so i can say hi");
    });

    test("says so when a gadget is being rewritten rather than created", () => {
        expect(approvalText({ ...GADGET, kind: "rewrite gadget" })).toContain(
            "rewrite gadget `greet`",
        );
    });

    test("says so when what is on the stake is going away", () => {
        expect(approvalText({ ...GADGET, kind: "delete gadget" })).toContain(
            "delete gadget `greet`",
        );
    });

    test("leaves out a reason a protocol does not need", () => {
        const text = approvalText({ ...GADGET, kind: "create protocol", reason: "" });

        expect(text).toContain("create protocol `greet`");
        expect(text).not.toContain("why:");
    });
});
