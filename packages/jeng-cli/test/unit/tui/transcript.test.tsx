import { describe, expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { BlockView, blocks } from "../../../src/tui/transcript";

describe("transcript", () => {
    test("gathers jeng's own words and thinking into one box", () => {
        expect(
            blocks([
                { kind: "jeng", text: "a" },
                { kind: "think", text: "b" },
            ]).length,
        ).toBe(1);
    });

    test("boxes an action apart even though it wears jeng's colour", () => {
        const groups = blocks([
            { kind: "jeng", text: "a" },
            { kind: "tool", icon: "⚙", text: "read path=a.txt" },
        ]);

        expect(groups.map((group) => group.owner)).toEqual(["jeng", "tool"]);
    });

    test("keeps the speaker's turn apart from the other one", () => {
        const groups = blocks([
            { kind: "user", text: "hi" },
            { kind: "jeng", text: "hello" },
            { kind: "user", text: "bye" },
        ]);

        expect(groups.map((group) => group.owner)).toEqual(["user", "jeng", "user"]);
    });

    test("leaves an error outside every box", () => {
        const groups = blocks([{ kind: "error", icon: "err", text: "boom" }]);

        expect(groups).toEqual([
            { owner: undefined, entries: [{ kind: "error", icon: "err", text: "boom" }] },
        ]);
    });

    test("draws a box in the color of whoever speaks", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView block={{ owner: "jeng", entries: [{ kind: "jeng", text: "hello" }] }} />,
            { width: 20, height: 5 },
        );
        await flush();

        const border = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("─"));
        act(() => renderer.destroy());

        expect(border?.fg.equals(RGBA.fromHex("#d9a441"))).toBe(true);
    });

    test("holds the icon off the call it marks, in a column of its own", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <BlockView block={{ entries: [{ kind: "tool", icon: "⚙", text: "run" }] }} />,
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
