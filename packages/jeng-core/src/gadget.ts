import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { compileGadget } from "./compile";
import { imported } from "./dependency";
import type { Gui, GuiAnswers } from "./gui";
import { type State, sessionState } from "./state";
import type { Ui } from "./ui";

type GadgetResult = { ok: true; output: string } | { ok: false; error: string };

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

/** Whether a package is installed in this folder or in any folder above it, as a runtime looks. */
function resolves(name: string, from: string): boolean {
    for (let folder = from; ; folder = dirname(folder)) {
        try {
            Bun.resolveSync(name, folder);
            return true;
        } catch {
            const up = dirname(folder);
            if (up === folder) return false;
        }
    }
}

/**
 * A compiled jeng does not resolve a gadget's packages against the folder it lies in, so
 * they are resolved here instead. Doing it before the load is also what names a package
 * that is not installed there, rather than leaving it to fail as "cannot find package".
 */
function unresolved(file: string): string | undefined {
    const folder = dirname(file);
    for (const name of imported(readFileSync(file, "utf-8"))) {
        if (!resolves(name, folder)) return `"${name}" is not installed for this gadget`;
    }
    return undefined;
}

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
        // A compiled one carries its packages inside it, so there is nothing left to resolve.
        if (typeof gui !== "function") {
            const missing = unresolved(file);
            if (missing) return { ok: false, error: missing };
        }
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
