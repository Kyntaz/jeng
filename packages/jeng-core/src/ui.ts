import { prompt } from "./prompts";

/**
 * What a run can draw in. A host declares which one it is by taking the port for it,
 * so a run with neither is headless and lists nothing that draws.
 */
export type Surface = "tui" | "gui";

/**
 * One thing a gadget asked to be shown, in the vocabulary of the surface that will show it.
 *
 * A `gui` draw is numbered rather than being recognised by what it holds, because a window
 * is handed its state as JSON: two draws that were the same object on this side arrive as
 * two equal ones over there, and the id is the only thing that survives to say they are one
 * form rather than two copies of a coincidence.
 */
export type Draw =
    | { surface: "tui"; widget: Widget }
    | { surface: "gui"; id: number; file: string; props: Record<string, unknown> };

export type GuiDraw = Extract<Draw, { surface: "gui" }>;

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

export const UI_LANGUAGE = prompt("ui-language");
