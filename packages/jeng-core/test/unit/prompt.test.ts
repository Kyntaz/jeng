import { describe, expect, test } from "bun:test";
import { prompt } from "../../src/prompts";

describe("prompt", () => {
    test("fills a slot from the data it is given", () => {
        expect(prompt("gadget-draws", { name: "pick" })).toBe(
            'gadget "pick" draws its own interface, which this run has nowhere to show it. Say so with end instead.',
        );
    });

    test("leaves out the editor's trailing newline", () => {
        expect(prompt("nudge")).toBe(
            "That was plain text, which the user can see but which does not end your turn. " +
                'Call action="end" with no content now, since you have already said it, or call a tool if you still need one.',
        );
    });

    test("refuses to send a prompt with an unfilled slot", () => {
        expect(() => prompt("gadget-draws")).toThrow("gadget-draws has no slot name");
    });
});
