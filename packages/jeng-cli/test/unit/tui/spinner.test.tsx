import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { useSpinner } from "../../../src/tui/spinner";

function Spinner({ active }: { active: boolean }) {
    return <text content={useSpinner(active)} />;
}

describe("spinner", () => {
    test("rests on its first frame while nothing happens", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(<Spinner active={false} />, {
            width: 4,
            height: 1,
        });
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame.trim()).toBe("⠋");
    });

    test("moves on while jeng works", async () => {
        const { renderer, captureCharFrame, flush } = await testRender(<Spinner active />, {
            width: 4,
            height: 1,
        });
        await flush();
        await act(async () => await new Promise((resolve) => setTimeout(resolve, 100)));
        await flush();
        const frame = captureCharFrame();
        act(() => renderer.destroy());

        expect(frame.trim()).not.toBe("⠋");
    });
});
