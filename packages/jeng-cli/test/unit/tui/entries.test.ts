import { describe, expect, test } from "bun:test";
import { append, type Entry } from "../../../src/tui/entries";

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

        expect(entries.at(-1)?.text).toContain("lines=[1,2]");
    });

    test("cuts the args off so a tool line stays one line", () => {
        const entries = append([], {
            type: "tool",
            action: "run",
            args: { text: "x".repeat(200) },
        });

        expect((entries.at(-1)?.text.length ?? 0) <= 86).toBe(true);
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
});
