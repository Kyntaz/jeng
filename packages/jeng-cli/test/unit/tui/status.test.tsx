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
            <Footer busy={false} showThinking={false} spinner="⠋" page={0} />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("ctrl+esc quit  ctrl+l clear  esc interrupt  tab mode");
    });

    test("names the key that changes the mode", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy={false} showThinking={false} spinner="⠋" page={0} />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("tab mode");
    });

    test("leaves the spinner out while jeng is idle", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy={false} showThinking={false} spinner="⠋" page={0} />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).not.toContain("⠋");
    });

    test("shows the spinner while jeng works", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy showThinking={false} spinner="⠋" page={0} />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame).toContain("⠋ thinking");
    });

    test("fits a whole page of keys and the spinner and the counter on one line", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy showThinking={false} spinner="⠋" page={0} />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame.trim()).toBe(
            "ctrl+esc quit  ctrl+l clear  esc interrupt  tab mode  ⠋ thinking  ctrl+g 1/3",
        );
    });

    test("says which page of keys it is showing", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy={false} showThinking={false} spinner="⠋" page={1} />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame.trim()).toBe("ctrl+r detail  ctrl+p sessions  ctrl+g 2/3");
    });

    test("gives up its own room before the counter does when the line is too narrow", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer busy={false} showThinking={false} spinner="⠋" page={0} />,
            { width: 60, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect({
            page: frame.includes("ctrl+esc quit"),
            counter: frame.includes("ctrl+g 1/3"),
        }).toEqual({ page: false, counter: true });
    });

    test("replaces the pages with the keys that answer something jeng is waiting for", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(
            <Footer
                busy={false}
                showThinking={false}
                spinner="⠋"
                page={2}
                waiting={{ enter: "enter picks", other: "tab moves, esc rejects" }}
            />,
            { width: 80, height: 1 },
        );
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect({
            waiting: frame.includes("enter picks"),
            paged: frame.includes("ctrl+g 3/3"),
        }).toEqual({ waiting: true, paged: false });
    });
});
