import { describe, expect, test } from "bun:test";
import type { Agent, Mode } from "@jeng/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../../../src/tui/app";

function stubAgent(sent: string[], switched: Mode[], answer = "done"): Agent {
    let mode: Mode = "learn";
    return {
        homes: [],
        cwd: process.cwd(),
        history: [],
        memory: [],
        get mode() {
            return mode;
        },
        clear: () => {},
        inject: (text) => sent.push(text),
        setApprove: () => {},
        setUi: () => {},
        setMode: (next) => {
            mode = next;
            switched.push(next);
        },
        send: async (prompt) => {
            sent.push(prompt);
            return answer;
        },
    };
}

async function render(sent: string[], switched: Mode[] = []) {
    // Shift+Enter only arrives as its own key when the terminal reports
    // modifiers, which is what the kitty keyboard protocol buys.
    return testRender(<App agent={stubAgent(sent, switched)} onExit={() => {}} />, {
        width: 80,
        height: 24,
        kittyKeyboard: true,
    });
}

describe("prompt box", () => {
    test("sends what was typed when enter is pressed", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush } = await render(sent);

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(sent).toEqual(["hello"]);
    });

    test("sends the lines shift+enter wrote as a single prompt", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush } = await render(sent);

        await mockInput.typeText("first line");
        act(() => mockInput.pressEnter({ shift: true }));
        await mockInput.typeText("second line");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(sent).toEqual(["first line\nsecond line"]);
    });

    test("does not send again what it already sent", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush } = await render(sent);

        await mockInput.typeText("first line");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());

        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(sent).toEqual(["first line"]);
    });

    test("sends nothing when the box holds only newlines", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush } = await render(sent);

        act(() => mockInput.pressEnter({ shift: true }));
        act(() => mockInput.pressEnter({ shift: true }));
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(sent).toEqual([]);
    });

    test("shows the answer in jeng's box once it is back", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(sent);

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("done"));
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("done");
    });

    test("leaves the transcript behind on ctrl+l", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush, captureCharFrame } = await render(sent);

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressKey("l", { ctrl: true }));
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).not.toContain("done");
    });
});

describe("modes", () => {
    test("starts in the mode the agent was built with", async () => {
        const { renderer, mockInput, flush, captureCharFrame } = await render([]);

        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        const after = captureCharFrame();
        act(() => renderer.destroy());

        expect({ before: frame.includes("learn"), after: after.includes("work") }).toEqual({
            before: true,
            after: true,
        });
    });

    test("tab moves from learn to work and back again", async () => {
        const { renderer, mockInput, flush, captureCharFrame } = await render([]);

        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        const worked = captureCharFrame();
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        const learned = captureCharFrame();
        act(() => renderer.destroy());

        expect({ worked: worked.includes("work"), learned: learned.includes("learn") }).toEqual({
            worked: true,
            learned: true,
        });
    });

    test("tells the agent about the switch so the next turn is the new mode", async () => {
        const sent: string[] = [];
        const modes: Mode[] = [];
        const { renderer, mockInput, flush } = await render(sent, modes);

        act(() => mockInput.pressTab());
        await act(async () => await flush());
        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(modes).toEqual(["work"]);
    });
});
