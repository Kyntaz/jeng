import { describe, expect, test } from "bun:test";
import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { BlockView, blocks } from "../../../src/tui/transcript";

describe("transcript", () => {
    test("gathers jeng's own entries into one box", () => {
        expect(
            blocks([
                { kind: "jeng", text: "a" },
                { kind: "think", text: "b" },
                { kind: "tool", text: "c" },
            ]).length,
        ).toBe(1);
    });

    test("keeps the speaker's turn apart from the other one", () => {
        const groups = blocks([
            { kind: "user", text: "hi" },
            { kind: "jeng", text: "hello" },
            { kind: "user", text: "bye" },
        ]);

        expect(groups.map((group) => group.border)).toEqual(["#5fb3d4", "#d9a441", "#5fb3d4"]);
    });

    test("leaves an error outside every box", () => {
        const groups = blocks([{ kind: "error", text: "boom" }]);

        expect(groups).toEqual([{ border: undefined, entries: [{ kind: "error", text: "boom" }] }]);
    });

    test("draws a box in the color of whoever speaks", async () => {
        const { renderer, captureSpans, flush } = await testRender(
            <BlockView block={{ border: "#d9a441", entries: [{ kind: "jeng", text: "hello" }] }} />,
            { width: 20, height: 5 },
        );
        await flush();

        const border = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.text.includes("─"));
        act(() => renderer.destroy());

        expect(border?.fg.equals(RGBA.fromHex("#d9a441"))).toBe(true);
    });

    test("marks an error with a gutter instead of a box", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <BlockView block={{ entries: [{ kind: "error", text: "boom" }] }} />,
            { width: 20, height: 5 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("err  boom");
    });
});
