import { describe, expect, test } from "bun:test";
import type { Agent } from "@jeng/core";
import { createConversation } from "@jeng/view";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "../../../src/tui/app";

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

function stubAgent(answer: string): Agent {
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
        setApprove: () => {},
        setUi: () => {},
        setGui: () => {},
        setMode: () => {},
        send: async () => answer,
    };
}

describe("copying", () => {
    test("hands what the mouse dragged over to the clipboard", async () => {
        const copied: string[] = [];
        const { renderer, mockInput, mockMouse, flush, captureCharFrame, waitFor } =
            await testRender(<App {...run(stubAgent("a reply"))} onExit={() => {}} />, {
                width: 60,
                height: 20,
                kittyKeyboard: true,
            });

        // The alternate screen cannot be selected out of by the terminal itself, so
        // this is the only way the selection reaches the clipboard.
        renderer.copyToClipboardOSC52 = (text: string) => {
            copied.push(text);
            return true;
        };
        await mockInput.typeText("say something");
        act(() => mockInput.pressEnter());
        await act(async () => await flush());
        await waitFor(() => captureCharFrame().includes("a reply"));
        const reply = captureCharFrame()
            .split("\n")
            .findIndex((line) => line.includes("a reply"));
        await mockMouse.drag(3, reply, 16, reply);
        await act(async () => await flush());
        act(() => renderer.destroy());

        expect(copied.join("\n")).toContain("reply");
    });
});
