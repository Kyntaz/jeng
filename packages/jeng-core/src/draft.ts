import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGadget } from "./header";
import { prompt } from "./prompts";
import type { Ui } from "./ui";
import { validateGadget, validateGadgetSyntax } from "./validate";

const EXPORT_ARGUMENTS = /export\s+default\s+(?:async\s+)?(?:function\s*\w*\s*)?\(([^)]*)\)/;

// A second parameter is the interface argument, and the header is the only place
// Jeng looks to learn that, so a gadget drawing without saying so is a gadget that
// would be offered to a run with no way to show it.
function drawsUndeclared(source: string): boolean {
    const args = EXPORT_ARGUMENTS.exec(source)?.[1];
    return (args?.split(",").filter((arg) => arg.trim()).length ?? 0) > 1;
}

export interface Draft {
    name: string;
    file: string;
    /** Gone by the time the caller is done with the file: a draft is never left behind. */
    dispose: () => Promise<void>;
}

export type Prepared = { ok: false; content: string } | { ok: true; draft: Draft };

/**
 * Puts a gadget the model wrote through every gate that has to happen before a
 * person is asked about it, and hands back a file to import it from.
 */
export async function prepareGadget(
    source: string,
    reason: string,
    action: string,
    ui: Ui | undefined,
): Promise<Prepared> {
    // The user is about to let code run on their machine, so a gadget that
    // cannot say why it is wanted is refused before anyone is asked about it.
    if (!reason.trim())
        return {
            ok: false,
            content: `${action} needs a \`reason\`: the user reads it to decide whether to allow the gadget`,
        };

    const valid = validateGadget(source);
    if (!valid.ok) return { ok: false, content: valid.error };

    const header = parseGadget(source);

    if (header?.ui !== "true" && drawsUndeclared(source))
        return { ok: false, content: prompt("draws-undeclared") };

    // A gadget that draws would be dead code here, so it is refused before anyone
    // is asked about it rather than approved and then never offered again.
    if (header?.ui === "true" && !ui) return { ok: false, content: prompt("no-interface") };

    // The home is only ever written to once the user has agreed, so the file that
    // is compiled is a draft outside it: nothing survives a run that is cut short.
    const dir = await mkdtemp(join(tmpdir(), "jeng-draft-"));
    const file = join(dir, `${header?.name ?? "gadget"}.ts`);
    await Bun.write(file, source);

    const compiles = await validateGadgetSyntax(file);
    if (!compiles.ok) {
        await rm(dir, { recursive: true, force: true });
        return { ok: false, content: compiles.error };
    }

    return {
        ok: true,
        draft: {
            name: header?.name ?? "",
            file,
            dispose: () => rm(dir, { recursive: true, force: true }),
        },
    };
}
