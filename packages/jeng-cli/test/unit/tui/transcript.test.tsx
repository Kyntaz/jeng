import { describe, expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { BlockView, blocks, nameOf } from "../../../src/tui/transcript";

describe("transcript", () => {
    test("gathers jeng's own words and thinking into one box", () => {
        expect(
            blocks([
                { kind: "jeng", text: "a", mode: "learn" },
                { kind: "think", text: "b", mode: "learn" },
            ]).length,
        ).toBe(1);
    });

    test("boxes an action apart even though it wears jeng's colour", () => {
        const groups = blocks([
            { kind: "jeng", text: "a", mode: "learn" },
            { kind: "tool", icon: "⚙", text: "read path=a.txt", mode: "learn" },
        ]);

        expect(groups.map((group) => group.owner)).toEqual(["jeng", "tool"]);
    });

    test("keeps the output of an action inside the action's box", () => {
        const groups = blocks([
            { kind: "tool", icon: "⚙", text: "read path=a.txt", mode: "learn" },
            { kind: "output", icon: "↳", text: "a", mode: "learn" },
            { kind: "failure", icon: "↳", text: "boom", mode: "learn" },
        ]);

        expect(groups.length).toBe(1);
    });

    test("gives each action a box of its own, rather than one box for a run of them", () => {
        const groups = blocks([
            { kind: "tool", icon: "⚙", text: "read path=a.txt", mode: "learn" },
            { kind: "output", icon: "↳", text: "a", mode: "learn" },
            { kind: "tool", icon: "⚙", text: "read path=b.txt", mode: "learn" },
        ]);

        expect(groups.map((group) => group.entries.length)).toEqual([2, 1]);
    });

    test("draws the output of an action quieter than the call above it", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView
                block={{
                    entries: [{ kind: "output", icon: "↳", text: "a", mode: "learn" }],
                }}
            />,
            { width: 20, height: 5 },
        );
        await flush();
        const output = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("a"));
        act(() => renderer.destroy());

        expect(output?.fg.equals(RGBA.fromHex("#606070"))).toBe(true);
    });

    test("draws what an action could not return in the color of an error", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView
                block={{ entries: [{ kind: "failure", icon: "↳", text: "boom", mode: "learn" }] }}
            />,
            { width: 20, height: 5 },
        );
        await flush();
        const failure = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("boom"));
        act(() => renderer.destroy());

        expect(failure?.fg.equals(RGBA.fromHex("#e06c75"))).toBe(true);
    });

    test("keeps the speaker's turn apart from the other one", () => {
        const groups = blocks([
            { kind: "user", text: "hi" },
            { kind: "jeng", text: "hello", mode: "learn" },
            { kind: "user", text: "bye" },
        ]);

        expect(groups.map((group) => group.owner)).toEqual(["user", "jeng", "user"]);
    });

    test("opens a new box where the mode changed, rather than repainting the last one", () => {
        const groups = blocks([
            { kind: "jeng", text: "a", mode: "learn" },
            { kind: "jeng", text: "b", mode: "work" },
        ]);

        expect(groups.map((group) => group.mode)).toEqual(["learn", "work"]);
    });

    test("names a box after what is in it, so a box that moves is still the same box", () => {
        const said = { kind: "tool" as const, icon: "⚙", text: "read a", mode: "learn" as const };
        const later = { kind: "tool" as const, icon: "⚙", text: "read b", mode: "learn" as const };
        const [before, after] = blocks([said, later]);
        const [stillBefore, , stillAfter] = blocks([
            said,
            { kind: "error", icon: "err", text: "boom" },
            later,
        ]);

        expect({
            said: nameOf(before) === nameOf(stillBefore),
            later: nameOf(after) === nameOf(stillAfter),
            apart: nameOf(before) !== nameOf(after),
        }).toEqual({ said: true, later: true, apart: true });
    });

    test("leaves an error outside every box", () => {
        const groups = blocks([{ kind: "error", icon: "err", text: "boom" }]);

        expect(groups).toEqual([
            {
                owner: undefined,
                mode: undefined,
                entries: [{ kind: "error", icon: "err", text: "boom" }],
            },
        ]);
    });

    test("draws a box in the color of whoever speaks", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView
                block={{
                    owner: "jeng",
                    mode: "learn",
                    entries: [{ kind: "jeng", text: "hi", mode: "learn" }],
                }}
            />,
            { width: 20, height: 5 },
        );
        await flush();

        const border = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("─"));
        act(() => renderer.destroy());

        expect(border?.fg.equals(RGBA.fromHex("#d9a441"))).toBe(true);
    });

    test("draws the same box in blue once jeng is only working", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView
                block={{
                    owner: "jeng",
                    mode: "work",
                    entries: [{ kind: "jeng", text: "hi", mode: "work" }],
                }}
            />,
            { width: 20, height: 5 },
        );
        await flush();

        const border = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("─"));
        act(() => renderer.destroy());

        expect(border?.fg.equals(RGBA.fromHex("#5fb3d4"))).toBe(true);
    });

    test("draws an action in the mode it was called in, not learn's", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView
                block={{
                    owner: "tool",
                    mode: "work",
                    entries: [{ kind: "tool", icon: "⚙", text: "read_file", mode: "work" }],
                }}
            />,
            { width: 20, height: 5 },
        );
        await flush();

        const call = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("read_file"));
        act(() => renderer.destroy());

        expect(call?.fg.equals(RGBA.fromHex("#5fb3d4"))).toBe(true);
    });

    test("gives the user green, which is neither mode", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView block={{ owner: "user", entries: [{ kind: "user", text: "hi" }] }} />,
            { width: 20, height: 5 },
        );
        await flush();

        const border = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("─"));
        act(() => renderer.destroy());

        expect(border?.fg.equals(RGBA.fromHex("#98c379"))).toBe(true);
    });

    test("holds the icon off the call it marks, in a column of its own", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <BlockView
                block={{ entries: [{ kind: "tool", icon: "⚙", text: "run", mode: "learn" }] }}
            />,
            { width: 20, height: 5 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        // The box's own pad, the icon, then the gap of two.
        expect(frame).toContain(" ⚙  run");
    });

    test("marks an error with a gutter instead of a box", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <BlockView block={{ entries: [{ kind: "error", icon: "err", text: "boom" }] }} />,
            { width: 20, height: 5 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("err  boom");
    });

    test("holds a full-width line off the right border", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <BlockView
                block={{
                    owner: "jeng",
                    mode: "learn",
                    entries: [{ kind: "jeng", text: "0123456789abcdefghij", mode: "learn" }],
                }}
            />,
            { width: 20, height: 5 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("│ 0123456789abcdef │");
    });

    test("stays taller than its text when the column around it is too short", async () => {
        const jeng = (text: string) => ({
            owner: "jeng" as const,
            mode: "learn" as const,
            entries: [{ kind: "jeng" as const, text, mode: "learn" as const }],
        });
        const { renderer, captureCharFrame, flush } = await testRender(
            <box flexDirection="column" width={20} height={6}>
                <BlockView block={jeng("a reply that wraps onto a second line")} />
                <BlockView block={jeng("another reply that wraps as well")} />
                <BlockView block={jeng("a third reply that wraps as well")} />
            </box>,
            { width: 20, height: 8 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        // A squashed box is one whose lower border is written over by its own text.
        expect(frame).toContain("└──────────────────┘");
    });
});
