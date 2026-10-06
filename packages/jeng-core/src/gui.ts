import { prompt } from "./prompts";
import type { GuiDraw } from "./ui";

export type GuiAnswers = Record<string, unknown>;

/**
 * The second surface a gadget can draw on, as a gadget calls it. The file is named because
 * the component is exported by name from it, which is all the host has to go on and all it
 * can bundle for the browser.
 */
export type Gui = (file: string, props: Record<string, unknown>) => Promise<GuiAnswers>;

/**
 * The host's end of the same port, which is handed the whole draw rather than the file and
 * props alone. A window is a process away and cannot recognise a form by the object it
 * arrived in, so the number that says which form this is has to be part of what it is given.
 */
export type GuiHost = (draw: GuiDraw) => Promise<GuiAnswers>;

export const GUI_LANGUAGE = prompt("gui-language");
