import { pathToFileURL } from "node:url";
import type { Ui } from "./ui";

export type GadgetResult = { ok: true; output: string } | { ok: false; error: string };

// A gadget that draws is never listed where there is no UI, so this only keeps a
// call from handing one something that cannot answer.
const nowhere: Ui = async () => ({});

export async function runGadget(
    file: string,
    input: unknown,
    ui: Ui = nowhere,
): Promise<GadgetResult> {
    try {
        const gadget = (await import(pathToFileURL(file).href)) as {
            default?: (input: unknown, ui: Ui) => unknown;
        };
        if (typeof gadget.default !== "function")
            return { ok: false, error: "gadget does not export a default function" };

        const result = await gadget.default(input, ui);
        return {
            ok: true,
            output: typeof result === "string" ? result : JSON.stringify(result ?? null),
        };
    } catch (error) {
        return { ok: false, error: `gadget failed: ${(error as Error).message}` };
    }
}
