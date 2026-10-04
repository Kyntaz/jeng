import { type State, sessionState } from "./state";
import type { Ui } from "./ui";

export type GadgetResult = { ok: true; output: string } | { ok: false; error: string };

// A gadget that draws is never listed where there is no UI, so this only keeps a
// call from handing one something that cannot answer.
const nowhere: Ui = async () => ({});

// A gadget run outside a session has nowhere to keep anything, so a commit is
// refused rather than dropped and the model never believes it saved something.
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
        // Bun caches a module by path, so a gadget rewritten in place would go on
        // running the code it was first loaded with, and a model could never fix one by
        // editing it. Dropping it from the cache is what makes every call run the file as
        // it is now.
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
