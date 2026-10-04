import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { compact, Footer, Header } from "../../../src/tui/status";

describe("status bars", () => {
    test("names jeng, its mode and the homes it can reach", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Header homes={["~/work", "~/notes"]} tokens={0} mode="learn" />,
            { width: 40, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("jeng  learn  ~/work, ~/notes");
    });

    test("says which mode is in force rather than only colouring it", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Header homes={[]} tokens={0} mode="work" />,
            { width: 40, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("jeng  work");
    });

    test("shortens a context that overflows a thousand tokens", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Header homes={[]} tokens={1500} mode="learn" />,
            { width: 40, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("ctx 1.5k");
    });

    test("keeps a small context as it was counted", () => {
        expect(compact(999)).toBe("999");
    });

    test("reminds of the keys that never change", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy={false} showThinking={false} spinner="⠋" />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("ctrl+esc quit  ctrl+l clear  esc interrupt");
    });

    test("names the key that changes the mode", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy={false} showThinking={false} spinner="⠋" />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("tab mode");
    });

    test("leaves the spinner out while jeng is idle", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy={false} showThinking={false} spinner="⠋" />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).not.toContain("⠋");
    });

    test("shows the spinner while jeng works", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy showThinking={false} spinner="⠋" />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("⠋ thinking");
    });
});
