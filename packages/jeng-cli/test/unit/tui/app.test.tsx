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
    agents: string[] = [],
): Agent {
    let mode: Mode = "learn";
    return {
        homes: [],
        agents,
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
    agents: string[] = [],
) {
    // Shift+Enter only arrives as its own key when the terminal reports
    // modifiers, which is what the kitty keyboard protocol buys.
    return testRender(
        <App agent={stubAgent(sent, switched, answer, events, agents)} onExit={() => {}} />,
        {
            width: 80,
            height: 24,
            kittyKeyboard: true,
        },
    );
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

    test("scrolls to the last line of a long result once detail is switched on", async () => {
        // An action's output is held back until ctrl+r, and it is the longest thing
        // the transcript ever draws, so it is what proves a long entry can be read
        // to its end rather than only as far as one screen goes.
        const long = Array.from({ length: 300 }, (_, at) => `result ${at}`).join("\n");
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            [],
            [],
            "done",
            [
                { type: "tool", action: "read", args: { path: "a.txt" } },
                { type: "result", content: long, ok: true },
            ],
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("done"));
        act(() => mockInput.pressKey("r", { ctrl: true }));
        await act(async () => await flush());
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("result 299");
    });

    test("scrolls back up through a long result and returns to the end with ctrl+end", async () => {
        const long = Array.from({ length: 300 }, (_, at) => `result ${at}`).join("\n");
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            [],
            [],
            "done",
            [
                { type: "tool", action: "read", args: { path: "a.txt" } },
                { type: "result", content: long, ok: true },
            ],
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("done"));
        act(() => mockInput.pressKey("r", { ctrl: true }));
        await act(async () => await flush());
        await act(async () => await flush());
        // The end is where a turn leaves the transcript, so scrolling back is what
        // has to be undone rather than re-read from the top of a long result.
        await mockInput.pressKeys(["\u001b[5~"]);
        await act(async () => await flush());
        const up = captureCharFrame();
        await mockInput.pressKeys(["\u001b[1;5F"]);
        await act(async () => await flush());
        const back = captureCharFrame();
        act(() => renderer.destroy());

        expect({
            scrolledUp: !up.includes("result 299"),
            backAtEnd: back.includes("result 299"),
        }).toEqual({ scrolledUp: true, backAtEnd: true });
    });

    test("hangs a wrapped line under the icon rather than off it", async () => {
        // One line long enough to wrap, behind an icon, because the icon is a column
        // of its own and a wrap that hung off the marker would read as belonging to
        // the action above rather than to what the action said.
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            [],
            [],
            "done",
            [
                { type: "tool", action: "read", args: { path: "a.txt" } },
                { type: "result", content: "wrapped ".repeat(40), ok: true },
            ],
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("done"));
        act(() => mockInput.pressKey("r", { ctrl: true }));
        await act(async () => await flush());
        await act(async () => await flush());
        const lines = captureCharFrame().split("\n");
        const first = lines.findIndex((line) => line.includes("wrapped"));
        const continuation = lines[first + 1];
        act(() => renderer.destroy());

        // The box border and its padding take two columns and the icon and the gap take
        // three more, so the wrap starts at five rather than at the edge of the box.
        expect(continuation?.indexOf("wrapped")).toBe(5);
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

    test("holds a turn that fell over back until ctrl+r", async () => {
        // The one way the model request fails, so this is the whole of what an error
        // in the transcript is.
        const failing: Agent = {
            ...stubAgent([], []),
            send: async () => {
                throw new Error("boom");
            },
        };
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await testRender(
            <App agent={failing} onExit={() => {}} />,
            { width: 80, height: 24, kittyKeyboard: true },
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("hello"));
        const quiet = captureCharFrame();
        act(() => mockInput.pressKey("r", { ctrl: true }));
        await act(async () => await flush());
        const loud = captureCharFrame();
        act(() => renderer.destroy());

        expect({ quiet: quiet.includes("boom"), loud: loud.includes("boom") }).toEqual({
            quiet: false,
            loud: true,
        });
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

        await act(async () => await mockInput.typeText("first line"));
        act(() => mockInput.pressEnter({ shift: true }));
        await act(async () => await mockInput.typeText("second line"));
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

    test("names the loaded AGENTS.md files above the first message", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            sent,
            [],
            "done",
            [],
            [process.cwd()],
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("done"));
        // The list starts at the file, so whatever is drawn after this is a message.
        const first = captureCharFrame().split("\n")[1].trim();
        act(() => renderer.destroy());

        expect(first).toBe("▪ ./AGENTS.md");
    });

    test("names the loaded AGENTS.md files again once the session is cleared", async () => {
        const sent: string[] = [];
        const { renderer, mockInput, flush, captureCharFrame } = await render(
            sent,
            [],
            "done",
            [],
            [process.cwd()],
        );

        await mockInput.typeText("hello");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressKey("l", { ctrl: true }));
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("▪ ./AGENTS.md");
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
