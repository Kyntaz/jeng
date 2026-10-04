import { prompt } from "./prompts";

export type Choice = { name: string; description?: string };

export type Widget =
    | { kind: "text" | "markdown"; content: string }
    | { kind: "code"; content: string; filetype?: string }
    | { kind: "diff"; diff: string; filetype?: string }
    | { kind: "box"; direction: "row" | "col"; children: Widget[] }
    | { kind: "select"; name: string; question: string; options: Choice[] }
    | { kind: "input" | "textarea"; name: string; question: string; placeholder?: string };

/** What the user filled in. A field they walked away from is missing rather than empty. */
export type Answers = Record<string, string>;

/**
 * A gadget's second argument: draws a widget tree, then resolves to the answers.
 * One call is one round trip, so a whole interface is asked for in a single tree.
 */
export type Ui = (widget: Widget) => Promise<Answers>;

export interface Field {
    name: string;
    kind: "select" | "input" | "textarea";
}

// The order a tree is laid out in is the order tab walks its fields, so one
// traversal answers both questions rather than two traversals answering one each.
export function fields(widget: Widget): Field[] {
    if (widget.kind === "box") return widget.children.flatMap(fields);
    if (widget.kind === "select" || widget.kind === "input" || widget.kind === "textarea")
        return [{ name: widget.name, kind: widget.kind }];
    return [];
}

// The language lives beside the types it describes, and is only ever fetched by
// `load_ui`, so a model that never writes an interface gadget never pays for it.
export const UI_LANGUAGE = prompt("ui-language");
