import { prompt } from "./prompts";

export type Choice = { name: string; description?: string };

export type Widget =
    | { kind: "text" | "markdown"; content: string }
    | { kind: "code"; content: string; filetype?: string }
    | { kind: "diff"; diff: string; filetype?: string }
    | { kind: "box"; direction: "row" | "col"; children: Widget[] }
    | { kind: "select"; name: string; question: string; options: Choice[] }
    | { kind: "input" | "textarea"; name: string; question: string; placeholder?: string };

export type Answers = Record<string, string>;

export type Ui = (widget: Widget) => Promise<Answers>;

export interface Field {
    name: string;
    kind: "select" | "input" | "textarea";
}

export function fields(widget: Widget): Field[] {
    if (widget.kind === "box") return widget.children.flatMap(fields);
    // A select with nothing in it can only be walked away from, so it is a drawing
    // rather than a field: reported as one it would take the focus and hold the keys
    // while being impossible to answer.
    if (widget.kind === "select")
        return widget.options.length ? [{ name: widget.name, kind: widget.kind }] : [];
    if (widget.kind === "input" || widget.kind === "textarea")
        return [{ name: widget.name, kind: widget.kind }];
    return [];
}

export const UI_LANGUAGE = prompt("ui-language");
