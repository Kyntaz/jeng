import { describe, expect, test } from "bun:test";
import { DEFAULT_MODE, GROWS, identity, isMode, MODES } from "../../src/mode";

describe("mode", () => {
    test("grows the home by default", () => {
        expect({ mode: DEFAULT_MODE, modes: MODES }).toEqual({
            mode: "learn",
            modes: ["learn", "work"],
        });
    });

    test("accepts only the two modes it has", () => {
        expect({ learn: isMode("learn"), work: isMode("work"), other: isMode("explore") }).toEqual({
            learn: true,
            work: true,
            other: false,
        });
    });

    test("tells a learning jeng what it is for", () => {
        expect(identity("learn")).toContain("what you commit to");
    });

    test("tells a learning jeng how to gain an ability", () => {
        expect(identity("learn")).toContain("How you grow:");
    });

    test("keeps the growth out of a working jeng", () => {
        expect(identity("work")).not.toContain("How you grow:");
    });

    test("tells a working jeng it cannot change what it has", () => {
        expect(identity("work")).toContain("you cannot change it");
    });

    test("gives both modes the same rules about how a turn ends", () => {
        expect(identity("work")).toContain('{"action": "end", "content": "the answer"}');
        expect(identity("learn")).toContain('{"action": "end", "content": "the answer"}');
    });

    test("names every action that changes the home", () => {
        expect(GROWS).toEqual([
            "create_gadget",
            "test_gadget",
            "create_protocol",
            "delete_gadget",
            "delete_protocol",
            "load_ui",
            "load_gadget",
        ]);
    });
});
