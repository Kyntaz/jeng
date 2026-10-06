import { describe, expect, test } from "bun:test";
import type { Agent, Approval, ApprovalDecision, Approve, Mode } from "@jeng/core";
import { createConversation } from "@jeng/view";
import type { CapturedLine } from "@opentui/core";
import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../../../src/tui/app";
import { USER } from "../../../src/tui/theme";

const joined = (line: CapturedLine) => line.spans.map((span) => span.text).join("");

const GADGET: Approval = {
    kind: "create gadget",
    name: "greet",
    source: "/**\n * name: greet\n */\n\nexport default async () => 'hi there'\n",
    reason: "so i can say hi",
};

// Stands in for an agent whose whole turn is asking for one gadget and then
// waiting to be told what the user decided about it. The default turns it down,
// so a test that never reaches the app's own approver cannot pass by accident.
function stubAgent(decided: ApprovalDecision[]): Agent {
    let approve: Approve = async () => ({ approved: false, reason: "nobody was asked" });
    return {
        homes: [],
        agents: [],
        cwd: process.cwd(),
        model: "test-model",
        history: [],
        memory: [],
        mode: "learn",
        clear: () => {},
        inject: () => {},
        setApprove: (next) => {
            approve = next;
        },
        setUi: () => {},
        setGui: () => {},
        setMode: () => {},
        send: async () => {
            const decision = await approve(GADGET);
            decided.push(decision);
            return decision.approved ? "done" : "turned down";
        },
    };
}

/** A run with nothing written down to it, so the picker has nothing to offer. */
function run(agent: Agent) {
    return {
        run: {
            agent,
            talk: createConversation(agent),
            home: "/home/jeng",
            sessions: () => [],
        },
        resume: async () => {
            throw new Error("there is no session to load in this test");
        },
    };
}

async function render(agent: Agent, height = 24) {
    // Shift+Enter only arrives as its own key when the terminal reports
    // modifiers, which is what the kitty keyboard protocol buys.
    return testRender(<App {...run(agent)} onExit={() => {}} />, {
        width: 80,
        height,
        kittyKeyboard: true,
    });
}

describe("approving a gadget", () => {
    test("approves when enter lands on the approve button", async () => {
        const decided: ApprovalDecision[] = [];
        const { renderer, mockInput, flush } = await render(stubAgent(decided));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(decided).toEqual([{ approved: true }]);
    });

    test("offers both buttons while it waits for an answer", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            stubAgent([]),
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("approve"));
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("reject");
    });

    test("stacks the two buttons full width with the reason box under them", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            stubAgent([]),
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("approve"));
        const rows = captureCharFrame()
            .split("\n")
            .map((row) => row.trim().length);
        act(() => renderer.destroy());

        // The last three bordered rows are the two buttons and the reason box, each
        // spanning the whole eighty columns the test renders at.
        expect(rows.slice(-11, -8)).toEqual([80, 80, 80]);
    });

    test("sends back what was typed as the reason it was turned down", async () => {
        const decided: ApprovalDecision[] = [];
        const { renderer, mockInput, flush } = await render(stubAgent(decided));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        await mockInput.typeText("it deletes files");
        act(() => mockInput.pressTab({ shift: true }));
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(decided).toEqual([{ approved: false, reason: "it deletes files" }]);
    });

    test("turns it down on the reject button without asking for a reason", async () => {
        const decided: ApprovalDecision[] = [];
        const { renderer, mockInput, flush } = await render(stubAgent(decided));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(decided).toEqual([{ approved: false, reason: "" }]);
    });

    test("does not decide when enter breaks a line in the reason box", async () => {
        const decided: ApprovalDecision[] = [];
        const { renderer, mockInput, flush } = await render(stubAgent(decided));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        await mockInput.typeText("it deletes files");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(decided).toEqual([]);
    });

    test("sends back the lines enter separated as one reason", async () => {
        const decided: ApprovalDecision[] = [];
        const { renderer, mockInput, flush } = await render(stubAgent(decided));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        await mockInput.typeText("it deletes files");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("and it rewrites the home folder");
        act(() => mockInput.pressTab({ shift: true }));
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(decided).toEqual([
            { approved: false, reason: "it deletes files\nand it rewrites the home folder" },
        ]);
    });

    test("grows the reason box to hold every line of the reason", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            stubAgent([]),
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("approve"));
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        await mockInput.typeText("first line");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("second line");
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("second line");
    });

    test("stops growing at a third of the screen so the buttons stay put", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            stubAgent([]),
            18,
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("approve"));
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        for (let line = 0; line < 10; line++) {
            await act(async () => await mockInput.typeText(`line ${line}`));
            act(() => mockInput.pressEnter());
            await act(async () => await flush());
        }
        await act(async () => await flush());
        const rows = captureCharFrame().split("\n");
        const top = rows.findLastIndex((row) => row.startsWith("┌"));
        const bottom = rows.findLastIndex((row) => row.startsWith("└"));
        act(() => renderer.destroy());

        // The reason box is the last bordered thing on screen. Eighteen rows leave
        // it a third, so six rows of reason between its own borders however long
        // the reason gets, with both buttons still drawn above them.
        expect(bottom - top - 1).toBe(6);
    });

    test("keeps both ways out on screen under a long reason", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            stubAgent([]),
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("approve"));
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        await mockInput.typeText("it deletes files and rewrites the whole home folder twice over");
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect({ approve: frame.includes("approve"), reject: frame.includes("reject") }).toEqual({
            approve: true,
            reject: true,
        });
    });

    test("gives the answer the user's green, because the answer is theirs", async () => {
        const { renderer, mockInput, flush, captureSpans, waitFor } = await render(stubAgent([]));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureSpans().lines.some((line) => joined(line).includes("approve")));
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureSpans().lines.some((line) => joined(line).includes("approved")));
        const answer = captureSpans().lines.find((line) => joined(line).includes("approved"));
        const border = answer?.spans.find((span) => span.text.includes("│"));
        act(() => renderer.destroy());

        expect(border?.fg.equals(RGBA.fromHex(USER))).toBe(true);
    });

    test("holds on to what was half typed while jeng was working", async () => {
        const prompts: string[] = [];
        // The turn asks only once the test says so, which is the moment a user
        // would have the bar come up over a prompt they are halfway through.
        let ask: (() => void) | undefined;
        const ready = new Promise<void>((resolve) => {
            ask = resolve;
        });
        let approve: Approve = async () => ({ approved: false, reason: "nobody was asked" });
        const agent: Agent = {
            homes: [],
            agents: [],
            cwd: process.cwd(),
            model: "test-model",
            history: [],
            memory: [],
            mode: "learn",
            clear: () => {},
            inject: (text) => prompts.push(text),
            setApprove: (next) => {
                approve = next;
            },
            setUi: () => {},
            setGui: () => {},
            setMode: () => {},
            send: async (prompt, options) => {
                prompts.push(prompt);
                options?.onEvent?.({ type: "tool", action: "list_gadgets", args: {} });
                await ready;
                return (await approve(GADGET)).approved ? "done" : "turned down";
            },
        };
        const { renderer, mockInput, flush } = await testRender(
            <App {...run(agent)} onExit={() => {}} />,
            { width: 80, height: 24, kittyKeyboard: true },
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("then greet me");
        act(() => ask?.());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText(" by name");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(prompts).toEqual(["say hi", "then greet me by name"]);
    });

    test("leaves the source in the transcript, so there is something to review", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            stubAgent([]),
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("create gadget"));
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("export default async () => 'hi there'");
    });

    test("tab walks the bar instead of changing the mode", async () => {
        const switched: Mode[] = [];
        const agent = stubAgent([]);
        agent.setMode = (next) => switched.push(next);
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(agent);

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("approve"));
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect({ switched, stillLearning: frame.includes("learn") }).toEqual({
            switched: [],
            stillLearning: true,
        });
    });

    test("has no page to turn while the footer is answering something", async () => {
        const { renderer, mockInput, flush, captureCharFrame, waitFor } = await render(
            stubAgent([]),
        );

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("approve"));
        act(() => mockInput.pressKey("g", { ctrl: true }));
        await act(async () => await flush());
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).not.toContain("ctrl+g");
    });
});
