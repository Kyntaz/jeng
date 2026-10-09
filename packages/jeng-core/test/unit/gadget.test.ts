import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGadget } from "../../src/gadget";
import { persistentState, sessionState } from "../../src/state";
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

        expect(await runGadget(file, {}, { ui })).toEqual({ ok: true, output: "on main" });
        await rm(dir, { recursive: true, force: true });
    });

    test("hands a gui gadget its own file, because that is where its component is exported from", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "review.tsx");
        await Bun.write(
            file,
            "/**\n * name: review\n * gui: true\n * description: asks\n */\n\nexport function View() {\n    return null\n}\n\nexport default async (_input: unknown, ui: (props: object) => Promise<object>) => {\n    const answers = await ui({ diff: 'x' })\n    return JSON.stringify(answers)\n}\n",
        );

        const seen: string[] = [];
        const result = await runGadget(
            file,
            {},
            {
                gui: async (gadgetFile, props) => {
                    seen.push(gadgetFile);
                    return { verdict: "ship it", diff: props.diff };
                },
            },
        );

        expect(seen).toEqual([file]);
        expect(result).toEqual({
            ok: true,
            output: '{"verdict":"ship it","diff":"x"}',
        });
        await rm(dir, { recursive: true, force: true });
    });

    test("hands the state to the default export as its third argument", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "remember.ts");
        await Bun.write(
            file,
            "/**\n * name: remember\n * description: remembers\n */\n\nexport default async (_input: unknown, _ui: unknown, state: State) => {\n    await state.session.set('who', 'ada')\n    return JSON.stringify(await state.session.get('who'))\n}\n",
        );

        const result = await runGadget(file, {}, undefined, {
            session: sessionState(),
            persistent: persistentState(dir),
        });

        expect(result).toEqual({ ok: true, output: '"ada"' });
        await rm(dir, { recursive: true, force: true });
    });

    test("refuses a commit rather than dropping it when there is no home to keep it in", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "keep.ts");
        await Bun.write(
            file,
            "/**\n * name: keep\n * description: keeps\n */\n\nexport default async (_input: unknown, _ui: unknown, state: State) => {\n    await state.persistent.set('who', 'ada')\n    return 'kept'\n}\n",
        );

        expect(await runGadget(file, {})).toEqual({
            ok: false,
            error: "gadget failed: this run has no home to keep state in",
        });
        await rm(dir, { recursive: true, force: true });
    });

    test("runs a rewritten file rather than the version it first loaded", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "greet.ts");
        const header = "/**\n * name: greet\n * description: greets\n */\n\n";
        await Bun.write(file, `${header}export default () => "hi"\n`);
        expect(await runGadget(file, null)).toEqual({ ok: true, output: "hi" });

        await Bun.write(file, `${header}export default () => "hi there"\n`);
        expect(await runGadget(file, null)).toEqual({ ok: true, output: "hi there" });

        await rm(dir, { recursive: true, force: true });
    });

    test("names a package that is not installed rather than leaving it to the loader", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "needy.ts");
        await Bun.write(
            file,
            '/**\n * name: needy\n * description: wants a package\n */\n\nimport isOdd from "is-odd"\n\nexport default () => String(isOdd(3))\n',
        );

        expect(await runGadget(file, null)).toEqual({
            ok: false,
            error: '"is-odd" is not installed for this gadget',
        });
        await rm(dir, { recursive: true, force: true });
    });

    test("does not call a package missing when the folder above the gadget has it", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const home = join(dir, "home");
        await mkdir(join(home, "gadgets"), { recursive: true });
        await Bun.write(
            join(home, "node_modules", "local-pkg", "package.json"),
            '{"name":"local-pkg","version":"1.0.0","main":"index.js"}',
        );
        await Bun.write(
            join(home, "node_modules", "local-pkg", "index.js"),
            "export const v = 7;\n",
        );
        const file = join(home, "gadgets", "uses.ts");
        await Bun.write(
            file,
            '/**\n * name: uses\n * description: uses a local package\n */\n\nimport { v } from "local-pkg"\n\nexport default () => String(v)\n',
        );

        expect(await runGadget(file, null)).toEqual({ ok: true, output: "7" });
        await rm(dir, { recursive: true, force: true });
    });

    test("starts a gadget over on every call", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gadget-"));
        const file = join(dir, "count.ts");
        await Bun.write(
            file,
            "/**\n * name: count\n * description: counts\n */\n\nlet n = 0\n\nexport default () => String(++n)\n",
        );

        expect(await runGadget(file, null)).toEqual({ ok: true, output: "1" });
        expect(await runGadget(file, null)).toEqual({ ok: true, output: "1" });

        await rm(dir, { recursive: true, force: true });
    });
});
