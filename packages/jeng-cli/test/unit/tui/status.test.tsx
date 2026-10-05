import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { compact, Footer, Header, Instructions } from "../../../src/tui/status";

describe("status bars", () => {
    test("names the files whose instructions the model always reads", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Instructions agents={["/home/jeng/.jeng", "/work"]} cwd="/work" />,
            { width: 60, height: 3 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(
            frame
                .split("\n")
                .map((row) => row.trimEnd())
                .slice(0, 2),
        ).toEqual(["  ▪ /home/jeng/.jeng/AGENTS.md", "  ▪ ./AGENTS.md"]);
    });

    test("says nothing when no file was found", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Instructions agents={[]} cwd="/work" />,
            { width: 60, height: 3 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).not.toContain("AGENTS.md");
    });

    test("names jeng, its mode, where it works and the homes it can reach", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Header
                cwd="/work"
                homes={["/work/.jeng", "/elsewhere"]}
                model="gpt-4o-mini"
                tokens={0}
                mode="learn"
            />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("jeng gpt-4o-mini  learn  /work  .jeng, /elsewhere");
    });

    test("says which model it is speaking for", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Header cwd="/work" homes={[]} model="space-bunny-free" tokens={0} mode="work" />,
            { width: 60, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("jeng space-bunny-free  work  /work");
    });

    test("shortens a context that overflows a thousand tokens", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Header cwd="" homes={[]} model="gpt-4o-mini" tokens={1500} mode="learn" />,
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
