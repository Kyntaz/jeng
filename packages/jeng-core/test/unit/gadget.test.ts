import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGadget } from "../../src/gadget";
import type { Ui } from "../../src/ui";

describe("gadget", () => {
    test("hands the input to the default export and returns what it gives back", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "echo.ts");
        await Bun.write(
            file,
            "/**\n * name: echo\n * description: echoes\n */\n\nexport default (input: { a: number }) => ({ doubled: input.a * 2 })\n",
        );

        expect(await runGadget(file, { a: 21 })).toEqual({ ok: true, output: '{"doubled":42}' });
        await rm(dir, { recursive: true, force: true });
    });

    test("returns a string result as is rather than quoting it", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "greet.ts");
        await Bun.write(
            file,
            // biome-ignore lint/suspicious/noTemplateCurlyInString: gadget source, not a template
            "/**\n * name: greet\n * description: greets\n */\n\nexport default (who: string) => `hi ${who}`\n",
        );

        expect(await runGadget(file, "world")).toEqual({ ok: true, output: "hi world" });
        await rm(dir, { recursive: true, force: true });
    });

    test("reports a throwing gadget as an error instead of blowing up the agent", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "boom.ts");
        await Bun.write(
            file,
            '/**\n * name: boom\n * description: fails\n */\n\nexport default () => {\n    throw new Error("kaboom");\n}\n',
        );

        expect(await runGadget(file, null)).toEqual({ ok: false, error: "gadget failed: kaboom" });
        await rm(dir, { recursive: true, force: true });
    });

    test("hands the interface to the default export and returns what the user answered", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "pick.ts");
        await Bun.write(
            file,
            '/**\n * name: pick\n * ui: true\n * description: asks\n */\n\nexport default async (_input: unknown, ui: Ui) => {\n    const answers = await ui({ kind: "select", name: "branch", question: "which?", options: [] })\n    return "on " + (answers.branch ?? "nothing")\n}\n',
        );

        const ui: Ui = async () => ({ branch: "main" });

        expect(await runGadget(file, {}, ui)).toEqual({ ok: true, output: "on main" });
        await rm(dir, { recursive: true, force: true });
    });
});
