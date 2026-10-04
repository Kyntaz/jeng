import { describe, expect, test } from "bun:test";
import type { Agent, Approval, ApprovalDecision, Approve } from "@jeng/core";
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
        history: [],
        memory: [],
        clear: () => {},
        inject: () => {},
        setApprove: (next) => {
            approve = next;
        },
        setUi: () => {},
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
    test("approves when the box is submitted empty", async () => {
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

    test("sends back what was typed as the reason it was turned down", async () => {
        const decided: ApprovalDecision[] = [];
        const { renderer, mockInput, flush } = await render(stubAgent(decided));

        await mockInput.typeText("say hi");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await mockInput.typeText("it deletes files");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(decided).toEqual([{ approved: false, reason: "it deletes files" }]);
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
});
