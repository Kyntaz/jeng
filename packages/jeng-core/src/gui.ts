import { prompt } from "./prompts";

export type GuiAnswers = Record<string, unknown>;

/**
 * What a gadget's react component is handed on top of whatever it passed itself.
 *
 * `answer` is how a live form is answered and is absent once it has been, which is
 * what tells a component to draw itself as a record. `answers` is what it was given,
 * and is present only on that record.
 */
export interface GuiProps {
    answer?: (answers: GuiAnswers) => void;
    answers?: GuiAnswers;
}

/**
 * The second surface a gadget can draw on. The gadget's own file is in the signature
 * because the component is exported by name from it, which is the only thing the host
 * has to go on and the only thing it can bundle for the browser.
 */
export type Gui = (file: string, props: Record<string, unknown>) => Promise<GuiAnswers>;

export const GUI_LANGUAGE = prompt("gui-language");
