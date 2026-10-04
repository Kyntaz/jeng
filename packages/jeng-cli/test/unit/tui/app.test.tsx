import { describe, expect, test } from "bun:test";
import type { Agent, AgentEvent, Mode } from "@jeng/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../../../src/tui/app";

function stubAgent(
    sent: string[],
    switched: Mode[],
    answer = "done",
    events: AgentEvent[] = [],
): Agent {
    let mode: Mode = "learn";
    return {
        homes: [],
        cwd: process.cwd(),
        model: "test-model",
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
        send: async (prompt, options) => {
            sent.push(prompt);
            for (const event of events) options?.onEvent?.(event);
            return answer;
        },
    };
}

async function render(
    sent: string[],
    switched: Mode[] = [],
    answer = "done",
    events: AgentEvent[] = [],
) {
    // Shift+Enter only arrives as its own key when the terminal reports
    // modifiers, which is what the kitty keyboard protocol buys.
    return testRender(<App agent={stubAgent(sent, switched, answer, events)} onExit={() => {}} />, {
        width: 80,
        height: 24,
        kittyKeyboard: true,
    });
}

describe("transcript", () => {
    test("keeps a long answer off the header row that it scrolls under", async () => {
        const long = Array.from({ length: 60 }, (_, at) => `line ${at}`).join("\n");
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            [],
            [],
            long,
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("line 59"));
        const header = captureCharFrame().split("\n")[0];
        act(() => renderer.destroy());

        expect(header).not.toContain("│");
    });

    test("keeps the first box clear of the header it is laid over", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            [],
            [],
            "done",
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("done"));
        const underHeader = captureCharFrame().split("\n")[1];
        act(() => renderer.destroy());

        // The box opens below the header rather than underneath it, where its own top
        // border would be the row the header has already painted over.
        expect(underHeader).toContain("┌");
    });

    test("puts the transcript back as it was once detail is switched off again", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            [],
            [],
            "done",
            [
                { type: "tool", action: "read", args: { path: "a.txt" } },
                { type: "result", content: "three files", ok: true },
            ],
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("read path=a.txt"));
        await waitFor(() => !captureCharFrame().includes("thinking"));
        const before = captureCharFrame();
        act(() => mockInput.pressKey("r", { ctrl: true }));
        await act(async () => await flush());
        act(() => mockInput.pressKey("r", { ctrl: true }));
        await act(async () => await flush());
        const after = captureCharFrame();
        act(() => renderer.destroy());

        expect(after).toBe(before);
    });

    test("holds what an action returned back until ctrl+r", async () => {
        const { renderer, mockInput, flush, captureCharFrame } = await render([], [], "done", [
            { type: "tool", action: "read", args: { path: "a.txt" } },
            { type: "result", content: "three files", ok: true },
        ]);

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        const before = captureCharFrame();
        act(() => mockInput.pressKey("r", { ctrl: true }));
        await act(async () => await flush());
        const after = captureCharFrame();
        act(() => renderer.destroy());

        expect({
            before: before.includes("three files"),
            after: after.includes("three files"),
        }).toEqual({ before: false, after: true });
    });

    test("leaves what an action could not return on screen", async () => {
        const { renderer, mockInput, flush, captureCharFrame } = await render([], [], "done", [
            { type: "tool", action: "read", args: { path: "a.txt" } },
            { type: "result", content: "no such file", ok: false },
        ]);

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("no such file");
    });
});

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
