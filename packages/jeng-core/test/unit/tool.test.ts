import { describe, expect, test } from "bun:test";
import { actionsFor, jengTool } from "../../src/tool";

describe("tool", () => {
    test("offers a learning jeng everything it can do", () => {
        expect(actionsFor("learn")).toEqual([
            "run_gadget",
            "test_gadget",
            "load_protocol",
            "load_gadget",
            "load_ui",
            "create_protocol",
            "create_gadget",
            "delete_gadget",
            "delete_protocol",
            "end",
            "compact",
        ]);
    });

    test("takes the writes away from a working jeng", () => {
        expect(actionsFor("work")).toEqual(["run_gadget", "load_protocol", "end", "compact"]);
    });

    test("never names a write action to a working jeng", () => {
        expect(jengTool("work").description).not.toContain("create_gadget");
    });

    test("tells a working jeng it cannot change anything", () => {
        expect(jengTool("work").description).toContain("cannot create, test or delete");
    });

    test("shows a working jeng no way to write source or give a reason", () => {
        expect(Object.keys(jengTool("work").parameters.properties)).toEqual([
            "action",
            "name",
            "input",
            "content",
            "summary",
        ]);
    });

    test("shows a learning jeng the source it has to write", () => {
        expect(Object.keys(jengTool("learn").parameters.properties)).toContain("source");
    });

    test("tells a learning jeng what a gadget file starts with", () => {
        expect(jengTool("learn").description).toContain("* name: count-lines");
    });

    test("tells both modes the name goes in name rather than inside input", () => {
        expect(jengTool("learn").description).toContain("The name goes in name.");
        expect(jengTool("work").description).toContain("The name goes in name.");
    });

    test("shows both modes a gadget call that puts the name in name", () => {
        expect(jengTool("learn").description).toContain(
            '{"action":"run_gadget","name":"read-file","input":"{\\"path\\":\\"README.md\\"}"}',
        );
        expect(jengTool("work").description).toContain(
            '{"action":"run_gadget","name":"read-file","input":"{\\"path\\":\\"README.md\\"}"}',
        );
    });

    test("tells both modes input is a string rather than an object", () => {
        expect(jengTool("learn").parameters.properties.input.type).toBe("string");
        expect(jengTool("work").parameters.properties.input.type).toBe("string");
    });

    test("always tells both modes that end is the only way a turn finishes", () => {
        expect(jengTool("learn").description).toContain("Hand control back to the user");
        expect(jengTool("work").description).toContain("Hand control back to the user");
    });
});
