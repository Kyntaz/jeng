import { type State, sessionState } from "./state";
import type { Ui } from "./ui";

export type GadgetResult = { ok: true; output: string } | { ok: false; error: string };

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
    ui: Ui = nowhere,
    state: State = nowhereState(),
): Promise<GadgetResult> {
    try {
        // Bun caches a module by path, so dropping it is what makes a rewritten
        // gadget run the file as it is now.
        delete require.cache[file];
        const gadget = require(file) as {
            default?: (input: unknown, ui: Ui, state: State) => unknown;
        };
        if (typeof gadget.default !== "function")
            return { ok: false, error: "gadget does not export a default function" };

        const result = await gadget.default(input, ui, state);
        return {
            ok: true,
            output: typeof result === "string" ? result : JSON.stringify(result ?? null),
        };
    } catch (error) {
        return { ok: false, error: `gadget failed: ${(error as Error).message}` };
    }
}
