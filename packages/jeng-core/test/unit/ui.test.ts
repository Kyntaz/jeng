import { describe, expect, test } from "bun:test";
import { fields, type Widget } from "../../src/ui";

const FORM: Widget = {
    kind: "box",
    direction: "col",
    children: [
        { kind: "text", content: "3 files changed" },
        { kind: "select", name: "action", question: "what now?", options: [] },
        {
            kind: "box",
            direction: "row",
            children: [
                { kind: "input", name: "message", question: "commit message" },
                { kind: "textarea", name: "notes", question: "notes" },
            ],
        },
    ],
};

describe("ui", () => {
    test("finds the fields of a tree in the order it lays them out", () => {
        expect(fields(FORM)).toEqual([
            { name: "action", kind: "select" },
            { name: "message", kind: "input" },
            { name: "notes", kind: "textarea" },
        ]);
    });

    test("reports no fields for a tree that only draws", () => {
        expect(fields({ kind: "code", content: "" })).toEqual([]);
    });
});
