import { GROWS, type Mode } from "./mode";
import { prompt } from "./prompts";

const ACTIONS = [
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
];

/**
 * The arguments only the actions that grow a home take. A working jeng cannot name any of
 * them, so a small model never sees the words at all.
 */
const GROWTH = {
    when: { type: "string", description: "for create_protocol: when to load this protocol" },
    description: { type: "string" },
    reason: {
        type: "string",
        description:
            "for create_gadget, test_gadget, delete_gadget and delete_protocol: why, in one line. the user reads it before deciding",
    },
    source: {
        type: "string",
        description:
            "for create_gadget and test_gadget: the complete TypeScript file, header first",
    },
    dependencies: {
        type: "array",
        items: { type: "string" },
        description:
            "for create_gadget: every package the gadget imports from npm, as `name@range`, and nothing else",
    },
};

export function actionsFor(mode: Mode): string[] {
    return mode === "work" ? ACTIONS.filter((action) => !GROWS.includes(action)) : ACTIONS;
}

export function jengTool(mode: Mode) {
    const growing = mode === "learn";
    return {
        name: "jeng",
        description: [
            [prompt("tool-open"), prompt("tool-uses")].join("\n"),
            prompt(growing ? "tool-learn" : "tool-work"),
            prompt("tool-close"),
        ].join("\n\n"),
        parameters: {
            type: "object",
            properties: {
                action: { type: "string", enum: actionsFor(mode) },
                name: {
                    type: "string",
                    description: `the gadget or protocol this action acts on, kebab-case${
                        growing
                            ? "; for create_gadget it is only a label, because a gadget is named after its own header"
                            : ""
                    }`,
                },
                input: {
                    type: "object",
                    description: `arguments for run_gadget${growing ? " and test_gadget" : ""}, as an object`,
                },
                ...(growing ? GROWTH : {}),
                content: {
                    type: "string",
                    description: `for end: the answer the user reads, or nothing if you already said it in plain text${
                        growing ? ". for create_protocol: the markdown body" : ""
                    }`,
                },
                summary: {
                    type: "string",
                    description: "for compact: what is worth keeping from this conversation",
                },
            },
            required: ["action"],
        },
    };
}
