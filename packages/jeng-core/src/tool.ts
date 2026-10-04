import { GROWS, type Mode } from "./mode";
import { prompt } from "./prompts";

export const ACTIONS = [
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

// Work mode is not offered the actions that change the home, so a model that only
// reads the tool never learns the words for them.
export function actionsFor(mode: Mode): string[] {
    return mode === "work" ? ACTIONS.filter((action) => !GROWS.includes(action)) : ACTIONS;
}

export function jengTool(mode: Mode) {
    return {
        name: "jeng",
        description: [
            [prompt("tool-open"), prompt("tool-uses")].join("\n"),
            prompt(mode === "work" ? "tool-work" : "tool-learn"),
            prompt("tool-close"),
        ].join("\n\n"),
        parameters: {
            type: "object",
            properties: {
                action: { type: "string", enum: actionsFor(mode) },
                name: {
                    type: "string",
                    description: `the gadget or protocol this action acts on, kebab-case${
                        mode === "work"
                            ? ""
                            : "; for create_gadget it is only a label, because a gadget is named after its own header"
                    }`,
                },
                input: {
                    type: "object",
                    description: `arguments for run_gadget${mode === "work" ? "" : " and test_gadget"}, as an object`,
                },
                ...(mode === "work"
                    ? {}
                    : {
                          when: {
                              type: "string",
                              description: "for create_protocol: when to load this protocol",
                          },
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
                      }),
                content: {
                    type: "string",
                    description: `for end: the answer the user reads${
                        mode === "work" ? "" : ". for create_protocol: the markdown body"
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
