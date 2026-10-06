import type { Widget } from "@jeng/core";

interface Field {
    name: string;
    kind: "select" | "input" | "textarea";
}

/**
 * Which parts of a widget tree ask for something, in the order they are laid out.
 *
 * This reads the vocabulary `@jeng/core` owns and is here rather than beside it because
 * only a frontend ever asks: what a draw is made of belongs to the agent, and which parts
 * of it a person has to answer is a question about drawing one.
 */
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
