import { describe, expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { BlockView, blocks } from "../../../src/tui/transcript";

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

        // The box pad and the row's own pad, the icon, then the gap of two.
        expect(frame).toContain("  ⚙  run");
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
});
