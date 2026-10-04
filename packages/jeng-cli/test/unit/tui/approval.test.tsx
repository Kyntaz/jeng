import { describe, expect, test } from "bun:test";
import type { Agent, Approval, ApprovalDecision, Approve, Mode } from "@jeng/core";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../../../src/tui/app";

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
        setMode: () => {},
        send: async () => {
            const decision = await approve(GADGET);
            decided.push(decision);
            return decision.approved ? "done" : "turned down";
        },
    };
}

async function render(agent: Agent) {
    // Shift+Enter only arrives as its own key when the terminal reports
    // modifiers, which is what the kitty keyboard protocol buys.
    return testRender(<App agent={agent} onExit={() => {}} />, {
        width: 80,
        height: 24,
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

    test("sends back what was typed as the reason it was turned down", async () => {
        const decided: ApprovalDecision[] = [];
        const { renderer, mockInput, flush } = await render(stubAgent(decided));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        await mockInput.typeText("it deletes files");
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
        act(() => mockInput.pressTab());
        await act(async () => await flush());
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(decided).toEqual([{ approved: false, reason: "" }]);
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
            setMode: () => {},
            send: async (prompt, options) => {
                prompts.push(prompt);
                options?.onEvent?.({ type: "tool", action: "list_gadgets", args: {} });
                await ready;
                return (await approve(GADGET)).approved ? "done" : "turned down";
            },
        };
        const { renderer, mockInput, flush } = await testRender(
            <App agent={agent} onExit={() => {}} />,
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
});
