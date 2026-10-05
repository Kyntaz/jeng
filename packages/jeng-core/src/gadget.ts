import { compileGadget } from "./compile";
import type { Gui, GuiAnswers } from "./gui";
import { type State, sessionState } from "./state";
import type { Ui } from "./ui";

export type GadgetResult = { ok: true; output: string } | { ok: false; error: string };

/** The second argument a gadget is handed: whichever one surface its header declared. */
type Port = Ui | ((props: Record<string, unknown>) => Promise<GuiAnswers>);

/** The surfaces a host may have taken. Whichever is present is the one a gadget draws in. */
export interface Ports {
    ui?: Ui;
    gui?: Gui;
}

const nowhere: Ui = async () => ({});

const nowhereState = (): State => ({
    session: sessionState(),
    persistent: {
        get: async () => undefined,
        set: async () => {
            throw new Error("this run has no home to keep state in");
        },
    },
});

export async function runGadget(
    file: string,
    input: unknown,
    ports: Ports = {},
    state: State = nowhereState(),
): Promise<GadgetResult> {
    try {
        const { gui, ui } = ports;
        // A gadget that draws a component is jsx and cannot be run where it lies, so it
        // is compiled first. Which one a gadget is was decided by its header, not here.
        const module = typeof gui === "function" ? await compileGadget(file) : file;

        // Bun caches a module by path, so dropping it is what makes a rewritten
        // gadget run the file as it is now.
        delete require.cache[module];
        const gadget = require(module) as {
            default?: (input: unknown, ui: Port, state: State) => unknown;
        };
        if (typeof gadget.default !== "function")
            return { ok: false, error: "gadget does not export a default function" };

        const port = gui ? (props: Record<string, unknown>) => gui(file, props) : ui;
        const result = await gadget.default(input, port ?? nowhere, state);
        return {
            ok: true,
            output: typeof result === "string" ? result : JSON.stringify(result ?? null),
        };
    } catch (error) {
        return { ok: false, error: `gadget failed: ${(error as Error).message}` };
    }
}
