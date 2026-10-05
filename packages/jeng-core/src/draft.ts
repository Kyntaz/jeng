import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGadget } from "./header";
import { prompt } from "./prompts";
import type { Ui } from "./ui";
import { validateGadget, validateGadgetSyntax } from "./validate";

const EXPORT_ARGUMENTS = /export\s+default\s+(?:async\s+)?(?:function\s*\w*\s*)?\(([^)]*)\)/;

// The header is the only place Jeng learns a gadget draws, so one that draws
// without saying so is a gadget that would be offered to a run with nowhere to
// show it.
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

export async function prepareGadget(
    source: string,
    reason: string,
    action: string,
    ui: Ui | undefined,
): Promise<Prepared> {
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

    if (header?.ui === "true" && !ui) return { ok: false, content: prompt("no-interface") };

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
