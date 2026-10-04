import { describe, expect, test } from "bun:test";
import type { Agent, Answers, Ui, Widget } from "@jeng/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../../../src/tui/app";

// Stands in for an agent whose whole turn is handing one interface to the user and
// then waiting to hear what they made of it.
function stubAgent(widgets: Widget[]): { agent: Agent; answered: Answers[] } {
    const answered: Answers[] = [];
    let ui: Ui = async () => ({});
    const agent: Agent = {
        homes: [],
        cwd: process.cwd(),
        history: [],
        memory: [],
        mode: "learn",
        clear: () => {},
        inject: () => {},
        setApprove: () => {},
        setUi: (next) => {
            ui = next;
        },
        setMode: () => {},
        send: async (_prompt, options) => {
            for (const widget of widgets) {
                options?.onEvent?.({ type: "view", widget });
                answered.push(await ui(widget));
            }
            return "done";
        },
    };
    return { agent, answered };
}

async function render(agent: Agent) {
    return testRender(<App agent={agent} onExit={() => {}} />, {
        width: 80,
        height: 24,
        kittyKeyboard: true,
    });
}

// Highlighting is a tree-sitter parser warming up in a worker, so a frame that
// draws nothing yet proves nothing. Anything waiting on it has to wait for it.
async function settled(flush: () => Promise<void>, wanted: () => string): Promise<string> {
    for (let at = 0; at < 40; at++) {
        await act(async () => {
            await Bun.sleep(25);
            await flush();
        });
        const frame = wanted();
        if (frame) return frame;
    }
    return wanted();
}

const BRANCH: Widget = {
    kind: "box",
    direction: "col",
    children: [
        {
            kind: "select",
            name: "branch",
            question: "which branch?",
            options: [{ name: "main" }, { name: "develop" }],
        },
        { kind: "input", name: "why", question: "why that one?" },
    ],
};

describe("a gadget drawing its own interface", () => {
    test("draws the question and the options the gadget gave it", async () => {
        const { agent } = stubAgent([BRANCH]);
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(agent);

        await mockInput.typeText("pick a branch");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("which branch?"));
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("main");
        expect(frame).toContain("develop");
    });

    test("answers the form with the chosen option and what was typed", async () => {
        const { agent, answered } = stubAgent([BRANCH]);
        const { renderer, mockInput, flush, waitFor, captureCharFrame } = await render(agent);

        await mockInput.typeText("pick a branch");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("which branch?"));

        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("it is the release branch");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(answered).toEqual([{ branch: "main", why: "it is the release branch" }]);
    });

    test("leaves out the fields the user walked away from", async () => {
        const { agent, answered } = stubAgent([BRANCH]);
        const { renderer, mockInput, flush, waitFor, captureCharFrame } = await render(agent);

        await mockInput.typeText("pick a branch");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("which branch?"));

        act(() => mockInput.pressEscape());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(answered).toEqual([{}]);
    });

    test("keeps what was answered in the transcript once the form is gone", async () => {
        const { agent } = stubAgent([BRANCH]);
        const { renderer, mockInput, flush, waitFor, captureCharFrame } = await render(agent);

        await mockInput.typeText("pick a branch");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("which branch?"));
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("because");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("main");
        expect(frame).toContain("because");
    });

    test("walks back with tab to answer a field a second time", async () => {
        const { agent, answered } = stubAgent([BRANCH]);
        const { renderer, mockInput, flush, waitFor, captureCharFrame } = await render(agent);

        await mockInput.typeText("pick a branch");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("which branch?"));

        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressTab({ shift: true }));
        await act(async () => await flush());
        act(() => mockInput.pressArrow("down"));
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("it ships tonight");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(answered).toEqual([{ branch: "develop", why: "it ships tonight" }]);
    });

    test("draws a widget that asks nothing without ever holding the keys", async () => {
        const { agent, answered } = stubAgent([{ kind: "text", content: "3 files changed" }]);
        const { renderer, mockInput, flush, waitFor, captureCharFrame } = await render(agent);

        await mockInput.typeText("what changed?");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("3 files changed"));
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(answered).toEqual([{}]);
        // The idle footer is what says nothing is holding the keys, which is the
        // other half of a widget that asks nothing.
        expect(frame).toContain("esc interrupt");
    });

    test("draws markdown, so a gadget can put a table in front of the user", async () => {
        const { agent } = stubAgent([
            {
                kind: "markdown",
                content: "# Deploy failed\n\n| step | status |\n| --- | --- |\n| build | failed |",
            },
        ]);
        const { renderer, mockInput, flush, captureCharFrame } = await render(agent);

        await mockInput.typeText("how did it go?");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        const frame = await settled(flush, () => {
            const drawn = captureCharFrame();
            return drawn.includes("Deploy failed") ? drawn : "";
        });
        act(() => renderer.destroy());

        // The heading marker is hidden, which is what proves the markdown was
        // rendered rather than printed.
        expect(frame).toContain("Deploy failed");
        expect(frame).toContain("build");
        expect(frame).not.toContain("# Deploy");
    });

    test("draws a diff with the lines that changed marked", async () => {
        const { agent } = stubAgent([
            {
                kind: "diff",
                diff: [
                    "--- a/src/app.ts",
                    "+++ b/src/app.ts",
                    "@@ -1,3 +1,3 @@",
                    " const a = 1",
                    "-const b = 2",
                    "+const b = 3",
                ].join("\n"),
            },
        ]);
        const { renderer, mockInput, flush, captureCharFrame } = await render(agent);

        await mockInput.typeText("what changed?");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        const frame = await settled(flush, () => {
            const drawn = captureCharFrame();
            return drawn.includes("const b = 3") ? drawn : "";
        });
        act(() => renderer.destroy());

        expect(frame).toContain("const b = 2");
        expect(frame).toContain("const b = 3");
    });
});
