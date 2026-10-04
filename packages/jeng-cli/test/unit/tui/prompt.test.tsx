import { describe, expect, test } from "bun:test";
import { RGBA, type TextareaRenderable } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { act, createRef } from "react";
import { PromptInput } from "../../../src/tui/prompt";
import { MODE_TINT } from "../../../src/tui/theme";

async function renderPrompt(mode: "learn" | "work" = "learn") {
    const input = createRef<TextareaRenderable>();
    const sent: string[] = [];
    const setup = await testRender(
        <PromptInput
            input={input}
            mode={mode}
            onSubmit={() => {
                sent.push(input.current?.plainText ?? "");
                input.current?.clear();
            }}
        />,
        { width: 60, height: 6, kittyKeyboard: true },
    );
    return { ...setup, sent };
}

describe("prompt box", () => {
    test("submits what was typed on enter", async () => {
        const { renderer, mockInput, flush, sent } = await renderPrompt();

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(sent).toEqual(["hello"]);
    });

    test("writes the lines shift+enter separates without submitting", async () => {
        const { renderer, mockInput, flush, sent } = await renderPrompt();

        await mockInput.typeText("first line");
        act(() => mockInput.pressEnter({ shift: true }));
        await mockInput.typeText("second line");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(sent).toEqual(["first line\nsecond line"]);
    });

    test("empties itself after submitting so the next prompt starts clean", async () => {
        const { renderer, mockInput, flush, sent } = await renderPrompt();

        await mockInput.typeText("first");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("second");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(sent).toEqual(["first", "second"]);
    });

    test("wears a wash of the mode's own colour, so the transcript cannot show through it", async () => {
        const { renderer, captureSpans, flush } = await renderPrompt("work");

        await flush();
        const wash = captureSpans()
            .lines.flatMap((line) => line.spans)
            .find((span) => span.bg.equals(RGBA.fromHex(MODE_TINT.work)));
        act(() => renderer.destroy());

        expect(wash !== undefined).toBe(true);
    });
});
