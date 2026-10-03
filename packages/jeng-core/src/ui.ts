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

const AWAIT_EXAMPLE = [
    "    export default async (input: { repo: string }, ui) => {",
    '        const answers = await ui({ kind: "select", name: "branch", question: "which branch?",',
    '            options: [{ name: "main" }, { name: "develop" }] })',
    '        return answers.branch ? "switched to " + answers.branch : "the user changed their mind"',
    "    }",
].join("\n");

const COMPOSED_EXAMPLE = [
    "    export default async (input: { repo: string }, ui) => {",
    '        const answers = await ui({ kind: "box", direction: "col", children: [',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: gadget source, not a template
    '            { kind: "diff", diff: await Bun.$`git -C ${input.repo} diff`.text() },',
    '            { kind: "select", name: "action", question: "what should happen to them?", options: [',
    '                { name: "commit" }, { name: "stash" }, { name: "leave them" }] },',
    '            { kind: "input", name: "message", question: "commit message" }] })',
    "        return JSON.stringify(answers)",
    "    }",
].join("\n");

// The language lives beside the types it describes, and is only ever fetched by
// `load_ui`, so a model that never writes an interface gadget never pays for it.
export const UI_LANGUAGE = [
    "A gadget may take a second argument, `ui`, to put an interface of its own in front of the user.",
    "",
    AWAIT_EXAMPLE,
    "",
    "Call it with a widget and await it. It draws what you gave it, waits for the user, and resolves",
    "to `{ name: answer }` for every field they filled in. A field they walked away from is missing",
    "rather than empty, so check it before you use it. Your return value is still what Jeng reads;",
    "`ui` only decides what the user sees.",
    "",
    "A widget is one of:",
    "",
    '  { kind: "text"     content }',
    '  { kind: "markdown" content }              headings, lists, tables and the like',
    '  { kind: "code"     content, filetype? }',
    '  { kind: "diff"     diff, filetype? }      a real unified diff, e.g. the output of `git diff`',
    '  { kind: "box"      direction: "row" | "col", children: [widget, ...] }',
    '  { kind: "select"   name, question, options: [{ name, description? }] }',
    '  { kind: "input"    name, question, placeholder? }    one line of text',
    '  { kind: "textarea" name, question, placeholder? }    as many lines as they like',
    "",
    "Only select, input and textarea ask the user anything, and only those three need a name.",
    "Everything else is there to be looked at.",
    "",
    "One call is one round trip, so ask for everything in a single tree and the user answers all of",
    "it in one go. tab moves between fields, the form is sent as soon as the last field has an",
    "answer, and esc abandons it, leaving every field missing. So leave out any field the user could",
    "reasonably answer blank.",
    "",
    "A composed form:",
    "",
    COMPOSED_EXAMPLE,
    "",
    "A gadget that takes `ui` must add `* ui: true` to its header. One without a UI to draw on",
    "cannot run it at all, so it is not listed there either.",
].join("\n");
