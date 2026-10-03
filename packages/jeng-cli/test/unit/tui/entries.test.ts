import { describe, expect, test } from "bun:test";
import type { Widget } from "@jeng/core";
import { append, approvalText, type Entry } from "../../../src/tui/entries";

const GADGET = {
    kind: "gadget",
    name: "greet",
    source: "/**\n * name: greet\n */\n\nexport default async () => 'hi'\n",
    reason: "so i can say hi",
    replacing: false,
} as const;

describe("entries", () => {
    test("keeps a run of streamed text as one jeng entry", () => {
        const first = append([], { type: "text", text: "hel" });
        const second = append(first, { type: "text", text: "lo" });

        expect(second).toEqual([{ kind: "jeng", text: "hello" }]);
    });

    test("opens a new jeng entry when a tool interrupts the stream", () => {
        const entries = append([{ kind: "jeng", text: "one" }], {
            type: "tool",
            action: "read",
            args: { path: "a.txt", action: "read" },
        });

        expect(entries.at(-1)).toEqual({ kind: "tool", text: "⚙ read path=a.txt" });
    });

    test("serializes args that are not strings as json", () => {
        const entries = append([], { type: "tool", action: "run", args: { lines: [1, 2] } });

        expect(entries).toEqual([{ kind: "tool", text: "⚙ run lines=[1,2]" }]);
    });

    test("cuts the args off so a tool line stays one line", () => {
        const entries = append([], {
            type: "tool",
            action: "run",
            args: { text: "x".repeat(200) },
        });

        expect(entries).toEqual([{ kind: "tool", text: `⚙ run text=${"x".repeat(75)}` }]);
    });

    test("keeps a widget a gadget drew as an entry of its own", () => {
        const widget: Widget = { kind: "select", name: "branch", question: "which?", options: [] };

        expect(append([], { type: "view", widget })).toEqual([{ kind: "view", widget }]);
    });

    test("keeps a run of reasoning as one think entry", () => {
        const first = append([], { type: "reasoning", text: "may" });
        const second = append(first, { type: "reasoning", text: "be" });

        expect(second).toEqual([{ kind: "think", text: "maybe" }]);
    });

    test("does not fold reasoning into a jeng entry", () => {
        const entries = append([{ kind: "jeng", text: "hi" }], {
            type: "reasoning",
            text: "wait",
        });

        expect(entries).toEqual([
            { kind: "jeng", text: "hi" },
            { kind: "think", text: "wait" },
        ]);
    });

    test("marks a result as an arrow under the jeng box", () => {
        const entries = append([], { type: "result", content: "3 files", ok: true });

        expect(entries.at(-1)).toEqual({ kind: "tool", text: "↳ 3 files" });
    });

    test("ignores usage, which is a number and not a line", () => {
        const entries: Entry[] = [{ kind: "jeng", text: "hi" }];

        expect(append(entries, { type: "usage", promptTokens: 12 })).toEqual(entries);
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
        expect(approvalText({ ...GADGET, replacing: true })).toContain("rewrite gadget `greet`");
    });

    test("leaves out a reason a protocol does not need", () => {
        const text = approvalText({ ...GADGET, kind: "protocol", reason: "" });

        expect(text).toContain("create protocol `greet`");
        expect(text).not.toContain("why:");
    });
});
