import { pathToFileURL } from "node:url";

export type GadgetResult = { ok: true; output: string } | { ok: false; error: string };

export async function runGadget(file: string, input: unknown): Promise<GadgetResult> {
    try {
        const gadget = (await import(pathToFileURL(file).href)) as { default?: (input: unknown) => unknown };
        if (typeof gadget.default !== "function") return { ok: false, error: "gadget does not export a default function" };

        const result = await gadget.default(input);
        return { ok: true, output: typeof result === "string" ? result : JSON.stringify(result ?? null) };
    } catch (error) {
        return { ok: false, error: `gadget failed: ${(error as Error).message}` };
    }
}