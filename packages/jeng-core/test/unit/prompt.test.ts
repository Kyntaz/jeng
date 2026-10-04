import { describe, expect, test } from "bun:test";
import { prompt } from "../../src/prompts";

describe("prompt", () => {
    test("fills a slot from the data it is given", () => {
        expect(prompt("gadget-draws", { name: "pick" })).toBe(
            'gadget "pick" draws its own interface, which this run has nowhere to show it. Say so with end instead.',
        );
    });

    test("leaves out the editor's trailing newline", () => {
        expect(prompt("end-no-content")).toBe(
            "end was called with no content. Put the answer in content.",
        );
    });

    test("refuses to send a prompt with an unfilled slot", () => {
        expect(() => prompt("gadget-draws")).toThrow("gadget-draws has no slot name");
    });
});
