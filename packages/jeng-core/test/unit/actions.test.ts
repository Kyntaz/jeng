import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActionContext, runAction } from "../../src/actions";
import type { Approval, Approve } from "../../src/approve";
import type { Gui } from "../../src/gui";
import { loadHome } from "../../src/home";
import { sessionState } from "../../src/state";
import type { Ui } from "../../src/ui";

const allow: Approve = async () => ({ approved: true });

async function context(
    approve: Approve = allow,
    ports: { ui?: Ui; gui?: Gui } = {},
): Promise<{
    ctx: ActionContext;
    dir: string;
    cleanup: () => Promise<void>;
}> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-actions-"));
    return {
        dir,
        ctx: {
            homes: [await loadHome(dir)],
            cwd: dir,
            approve,
            ui: ports.ui,
            gui: ports.gui,
            session: sessionState(),
        },
        cleanup: () => rm(dir, { recursive: true, force: true }),
    };
}

// A stand-in user who turns down the first thing they are shown.
function turnsDownFirst(reason: string): { approve: Approve; asked: Approval[] } {
    const asked: Approval[] = [];
    return {
        asked,
        approve: async (request) => {
            asked.push(request);
            return asked.length === 1 ? { approved: false, reason } : { approved: true };
        },
    };
}

const GADGET =
    "/**\n * name: greet\n * description: says hi\n */\n\nexport default async () => 'hi'\n";

const UI_GADGET =
    '/**\n * name: pick\n * ui: true\n * description: asks which branch\n */\n\nexport default async (_input: unknown, ui: Ui) => {\n    const answers = await ui({ kind: "select", name: "branch", question: "which?", options: [] })\n    return "on " + (answers.branch ?? "nothing")\n}\n';

const GUI_GADGET =
    "/**\n * name: review\n * gui: true\n * description: asks what to do with a diff\n */\n\nexport function View(props: { branch: string }) {\n    return <button>{props.branch}</button>\n}\n\nexport default async (input: { branch: string }, ui: (props: object) => Promise<object>) =>\n    JSON.stringify(await ui(input))\n";

const WHY = "so i can say hi for you";

const IMPORTING =
    '/**\n * name: parse\n * description: parses yaml\n */\n\nimport { parse } from "yaml"\n\nexport default async () => parse("a: 1")\n';

/** A gadget with one import, plus the package it imports, so nothing has to come from npm. */
async function gadgetImporting(dir: string, name: string): Promise<string> {
    await Bun.write(
        join(dir, "pkg", "package.json"),
        '{"name":"jeng-local-pkg","version":"1.0.0","main":"index.js"}',
    );
    await Bun.write(join(dir, "pkg", "index.js"), 'export const parse = () => "parsed";\n');
    return `/**\n * name: ${name}\n * description: parses\n */\n\nimport { parse } from "jeng-local-pkg"\n\nexport default async () => parse()\n`;
}

describe("actions", () => {
    test("create_protocol writes the protocol and makes it available", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        expect(result.ok).toBe(true);
        await cleanup();
    });

    test("offers a protocol it committed to the next turn", async () => {
        const { ctx, cleanup } = await context();

        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        expect(ctx.homes[0].protocols.map((protocol) => protocol.name)).toEqual(["deploy"]);
        await cleanup();
    });

    test("lets a protocol be rewritten, since the model cannot edit files itself", async () => {
        const { ctx, cleanup } = await context();
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        const result = await runAction(
            "create_protocol",
            {
                name: "deploy",
                description: "how we ship",
                when: "deploying",
                content: "run make --fast",
            },
            ctx,
        );

        expect(result.content).toContain('protocol "deploy" rewritten');
        await cleanup();
    });

    test("puts the rewritten body in place of the old one", async () => {
        const { ctx, dir, cleanup } = await context();
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        await runAction(
            "create_protocol",
            {
                name: "deploy",
                description: "how we ship",
                when: "deploying",
                content: "run make --fast",
            },
            ctx,
        );

        expect(await Bun.file(join(dir, "protocols", "deploy.md")).text()).toContain(
            "run make --fast",
        );
        await cleanup();
    });

    test("does not keep the old protocol alongside the rewritten one", async () => {
        const { ctx, cleanup } = await context();
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        await runAction(
            "create_protocol",
            {
                name: "deploy",
                description: "how we ship",
                when: "deploying",
                content: "run make --fast",
            },
            ctx,
        );

        expect(ctx.homes[0].protocols.length).toBe(1);
        await cleanup();
    });

    test("tells the user a protocol they already approved is about to be replaced", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        await runAction(
            "create_protocol",
            {
                name: "deploy",
                description: "how we ship",
                when: "deploying",
                content: "run make --fast",
            },
            ctx,
        );

        expect(asked[1].kind).toBe("rewrite protocol");
        await cleanup();
    });

    test("create_protocol rejects an invalid protocol and leaves the home untouched", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction(
            "create_protocol",
            {
                name: "Deploy Flow",
                description: "how we ship",
                when: "deploying",
                content: "run make",
            },
            ctx,
        );

        expect(result).toEqual({
            ok: false,
            content: 'header `name` must be kebab-case (got "Deploy Flow"), e.g. `deploy-flow`',
        });
        await cleanup();
    });

    test("commits nothing when the protocol it was given is invalid", async () => {
        const { ctx, cleanup } = await context();

        await runAction(
            "create_protocol",
            {
                name: "Deploy Flow",
                description: "how we ship",
                when: "deploying",
                content: "run make",
            },
            ctx,
        );

        expect(ctx.homes[0].protocols).toEqual([]);
        await cleanup();
    });

    test("create_protocol reports the specific header problem it found", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", content: "run make" },
            ctx,
        );

        expect(result).toEqual({ ok: false, content: "header is missing a non-empty `when`" });
        await cleanup();
    });

    test("commits nothing when the protocol is missing a header field", async () => {
        const { ctx, cleanup } = await context();

        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", content: "run make" },
            ctx,
        );

        expect(ctx.homes[0].protocols).toEqual([]);
        await cleanup();
    });

    test("create_gadget writes a gadget that compiles and makes it available", async () => {
        const { ctx, cleanup } = await context();
        const source =
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default () => "hi"\n';

        const result = await runAction(
            "create_gadget",
            { name: "greet", reason: WHY, source },
            ctx,
        );

        expect(result.ok).toBe(true);
        await cleanup();
    });

    test("lists a gadget it committed", async () => {
        const { ctx, cleanup } = await context();
        const source =
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default () => "hi"\n';

        await runAction("create_gadget", { name: "greet", reason: WHY, source }, ctx);

        expect(ctx.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        await cleanup();
    });

    test("create_gadget rejects a gadget that does not compile and leaves no trace", async () => {
        const { ctx, cleanup } = await context();
        const source =
            "/**\n * name: broken\n * description: nope\n */\n\nexport default () => {\n";

        const result = await runAction(
            "create_gadget",
            { name: "broken", reason: WHY, source },
            ctx,
        );

        expect(result.ok).toBe(false);
        await cleanup();
    });

    test("leaves no gadget file behind when it would not compile", async () => {
        const { ctx, dir, cleanup } = await context();
        const source =
            "/**\n * name: broken\n * description: nope\n */\n\nexport default () => {\n";

        await runAction("create_gadget", { name: "broken", reason: WHY, source }, ctx);

        expect(await Bun.file(join(dir, "gadgets", "broken.ts")).exists()).toBe(false);
        await cleanup();
    });

    test("load_protocol hands back the whole protocol", async () => {
        const { ctx, cleanup } = await context();
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        const result = await runAction("load_protocol", { name: "deploy" }, ctx);

        expect(result.content).toContain("run make");
        await cleanup();
    });

    test("load_gadget hands back the whole gadget, so it can be fixed after it is forgotten", async () => {
        const { ctx, cleanup } = await context();
        await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(await runAction("load_gadget", { name: "greet" }, ctx)).toEqual({
            ok: true,
            content: GADGET,
        });
        await cleanup();
    });

    test("load_gadget rejects an unknown gadget by name", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("load_gadget", { name: "nope" }, ctx)).toEqual({
            ok: false,
            content: 'no gadget named "nope"',
        });
        await cleanup();
    });

    test("load_gadget is only a learning action, since a working jeng cannot fix what it reads", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction("load_gadget", { name: "greet" }, { ...ctx, mode: "work" });

        expect(result.ok).toBe(false);
        await cleanup();
    });

    test("run_gadget rejects an unknown gadget by name", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("run_gadget", { name: "nope" }, ctx)).toEqual({
            ok: false,
            content: 'no gadget named "nope"',
        });
        await cleanup();
    });

    test("run_gadget hands the gadget the object its input spells out", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            // biome-ignore lint/suspicious/noTemplateCurlyInString: gadget source, not a template
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string }) => `hi ${input.who}`\n",
        );
        ctx.homes = [await loadHome(dir)];

        const result = await runAction(
            "run_gadget",
            { name: "greet", input: '{"who":"world"}' },
            ctx,
        );

        expect(result).toEqual({ ok: true, content: "hi world" });
        await cleanup();
    });

    test("run_gadget reads a list inside its input as the list it is", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string[] }) => JSON.stringify(input.who)\n",
        );
        ctx.homes = [await loadHome(dir)];

        const result = await runAction(
            "run_gadget",
            { name: "greet", input: '{"who":["ada","grace"]}' },
            ctx,
        );

        expect(result).toEqual({ ok: true, content: '["ada","grace"]' });
        await cleanup();
    });

    test("run_gadget refuses an input string that is not json", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async () => 'hi'\n",
        );
        ctx.homes = [await loadHome(dir)];

        expect(await runAction("run_gadget", { name: "greet", input: "world" }, ctx)).toEqual({
            ok: false,
            content: 'input must be a json object written as a string, e.g. input={"who":"ada"}',
        });
        await cleanup();
    });

    test("run_gadget refuses a json string that is not an object", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("run_gadget", { name: "greet", input: '["ada"]' }, ctx)).toEqual({
            ok: false,
            content: 'input must be a json object written as a string, e.g. input={"who":"ada"}',
        });
        await cleanup();
    });

    test("run_gadget refuses an input sent as an object rather than a string", async () => {
        const { ctx, cleanup } = await context();

        expect(
            await runAction("run_gadget", { name: "greet", input: { who: "ada" } }, ctx),
        ).toEqual({
            ok: false,
            content: 'input must be a json object written as a string, e.g. input={"who":"ada"}',
        });
        await cleanup();
    });

    test("run_gadget asks for the name rather than finding one inside input", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async () => 'hi'\n",
        );
        ctx.homes = [await loadHome(dir)];

        expect(await runAction("run_gadget", { input: '{"name":"greet"}' }, ctx)).toEqual({
            ok: false,
            content: 'no gadget named ""',
        });
        await cleanup();
    });

    test("names a gadget after its own header, not the name the model passed", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction(
            "create_gadget",
            {
                name: "",
                reason: WHY,
                source: GADGET,
            },
            ctx,
        );

        expect(result.ok).toBe(true);
        await cleanup();
    });

    test("files a gadget that had no name from the model under its own header", async () => {
        const { ctx, cleanup } = await context();

        await runAction("create_gadget", { name: "", reason: WHY, source: GADGET }, ctx);

        expect(ctx.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        await cleanup();
    });

    test("writes that same gadget to the name its header asks for", async () => {
        const { ctx, dir, cleanup } = await context();

        await runAction("create_gadget", { name: "", reason: WHY, source: GADGET }, ctx);

        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).exists()).toBe(true);
        await cleanup();
    });

    test("lets a gadget be rewritten, since the model cannot edit files itself", async () => {
        const { ctx, cleanup } = await context();
        const broken = GADGET;
        const fixed =
            "/**\n * name: greet\n * description: says hi properly\n */\n\nexport default async () => 'hello'\n";

        await runAction("create_gadget", { reason: WHY, source: broken }, ctx);
        const result = await runAction("create_gadget", { reason: WHY, source: fixed }, ctx);

        expect(result.content).toContain('gadget "greet" rewritten');
        await cleanup();
    });

    test("puts the rewritten gadget source in place of the old one", async () => {
        const { ctx, dir, cleanup } = await context();
        const fixed =
            "/**\n * name: greet\n * description: says hi properly\n */\n\nexport default async () => 'hello'\n";

        await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);
        await runAction("create_gadget", { reason: WHY, source: fixed }, ctx);

        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).text()).toBe(fixed);
        await cleanup();
    });

    test("does not keep the old gadget alongside the rewritten one", async () => {
        const { ctx, cleanup } = await context();
        const fixed =
            "/**\n * name: greet\n * description: says hi properly\n */\n\nexport default async () => 'hello'\n";

        await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);
        await runAction("create_gadget", { reason: WHY, source: fixed }, ctx);

        expect(ctx.homes[0].gadgets.length).toBe(1);
        await cleanup();
    });

    test("runs the new behaviour of a gadget after rewriting it", async () => {
        const { ctx, cleanup } = await context();
        const fixed =
            "/**\n * name: greet\n * description: says hi properly\n */\n\nexport default async () => 'hello'\n";

        await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);
        await runAction("create_gadget", { reason: WHY, source: fixed }, ctx);

        expect(await runAction("run_gadget", { name: "greet" }, ctx)).toEqual({
            ok: true,
            content: "hello",
        });
        await cleanup();
    });

    test("an unknown action lists the ones that do exist", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("teleport", {}, ctx)).toEqual({
            ok: false,
            content:
                'unknown action "teleport". Available: run_gadget, test_gadget, load_protocol, load_gadget, load_ui, create_protocol, create_gadget, delete_gadget, delete_protocol, end, compact',
        });
        await cleanup();
    });

    test("puts the whole gadget to the user, since a summary is not something to allow", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(asked).toEqual([
            { kind: "create gadget", name: "greet", source: GADGET, reason: WHY },
        ]);
        await cleanup();
    });

    test("tells the user a gadget they already approved is about to be replaced", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });
        await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);

        await runAction(
            "create_gadget",
            { reason: WHY, source: GADGET.replace("'hi'", "'hello'") },
            ctx,
        );

        expect(asked[1].kind).toBe("rewrite gadget");
        await cleanup();
    });

    test("refuses a gadget that imports a package it did not ask for", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        const result = await runAction("create_gadget", { reason: WHY, source: IMPORTING }, ctx);

        expect(result).toEqual({
            ok: false,
            content: "gadget imports a package `dependencies` does not ask for: `yaml`",
        });
        await cleanup();
    });

    test("never troubles the user with a gadget whose package it never declared", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        await runAction("create_gadget", { reason: WHY, source: IMPORTING }, ctx);

        expect(asked).toEqual([]);
        await cleanup();
    });

    test("installs a gadget's package into the home before committing it", async () => {
        const { ctx, dir, cleanup } = await context();
        const source = await gadgetImporting(dir, "parse");

        await runAction(
            "create_gadget",
            { reason: WHY, source, dependencies: ["jeng-local-pkg@file:./pkg"] },
            ctx,
        );

        const manifest = await Bun.file(join(dir, "package.json")).json();
        expect(manifest).toEqual({ dependencies: { "jeng-local-pkg": "file:./pkg" } });
        await cleanup();
    });

    test("installs nothing until the user has approved the gadget", async () => {
        const user = turnsDownFirst("i do not know that package");
        const { ctx, dir, cleanup } = await context(user.approve);
        const source = await gadgetImporting(dir, "parse");

        await runAction(
            "create_gadget",
            { reason: WHY, source, dependencies: ["jeng-local-pkg@file:./pkg"] },
            ctx,
        );

        expect(await Bun.file(join(dir, "package.json")).exists()).toBe(false);
        await cleanup();
    });

    test("commits nothing when a package cannot be installed", async () => {
        const { ctx, dir, cleanup } = await context();
        const source = await gadgetImporting(dir, "parse");

        const result = await runAction(
            "create_gadget",
            { reason: WHY, source, dependencies: ["jeng-local-pkg@file:./nope"] },
            ctx,
        );

        expect(result.ok).toBe(false);
        await cleanup();
    });

    test("leaves no gadget file behind when a package cannot be installed", async () => {
        const { ctx, dir, cleanup } = await context();
        const source = await gadgetImporting(dir, "parse");

        await runAction(
            "create_gadget",
            { reason: WHY, source, dependencies: ["jeng-local-pkg@file:./nope"] },
            ctx,
        );

        expect(await Bun.file(join(dir, "gadgets", "parse.ts")).exists()).toBe(false);
        await cleanup();
    });

    test("writes nothing when the user turns the gadget down, and tells the model why", async () => {
        const user = turnsDownFirst("it deletes files");
        const { ctx, cleanup } = await context(user.approve);

        const result = await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(result).toEqual({
            ok: false,
            content:
                'the user rejected create gadget "greet": it deletes files. Change it and ask again.',
        });
        await cleanup();
    });

    test("leaves no gadget file behind when the user turns it down", async () => {
        const user = turnsDownFirst("it deletes files");
        const { ctx, dir, cleanup } = await context(user.approve);

        await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).exists()).toBe(false);
        await cleanup();
    });

    test("never asks about a gadget the model gave no reason for", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        const result = await runAction("create_gadget", { source: GADGET }, ctx);

        expect(result.ok).toBe(false);
        expect(asked).toEqual([]);
        await cleanup();
    });

    test("never asks the user to allow a gadget that would not compile", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });
        const broken = "/**\n * name: greet\n * description: says hi\n */\n\nexport default (\n";

        await runAction("create_gadget", { reason: WHY, source: broken }, ctx);

        expect(asked).toEqual([]);
        await cleanup();
    });

    test("puts a protocol to the user as the text that would be committed", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        expect(asked).toEqual([
            {
                kind: "create protocol",
                name: "deploy",
                source: "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make\n",
                reason: "",
            },
        ]);
        await cleanup();
    });

    test("commits nothing to memory when the user rejects the protocol", async () => {
        const user = turnsDownFirst("that is wrong, we use make ship");
        const { ctx, cleanup } = await context(user.approve);

        const result = await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        expect(result.content).toContain("that is wrong, we use make ship");
        await cleanup();
    });

    test("leaves the home empty when the user rejects the protocol", async () => {
        const user = turnsDownFirst("that is wrong, we use make ship");
        const { ctx, cleanup } = await context(user.approve);

        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        expect(ctx.homes[0].protocols).toEqual([]);
        await cleanup();
    });

    test("hands over the ui language when the model asks for it", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction("load_ui", {}, ctx);

        expect(result.ok).toBe(true);
        expect(result.content).toContain('kind: "select"');
        await cleanup();
    });

    test("refuses to create a gadget that draws without saying so in its header", async () => {
        const { ctx, cleanup } = await context(allow, { ui: async () => ({}) });
        const undeclared =
            '/**\n * name: pick\n * description: asks\n */\n\nexport default async (input: unknown, ui) => "hi"\n';

        const result = await runAction("create_gadget", { reason: WHY, source: undeclared }, ctx);

        expect(result).toEqual({
            ok: false,
            content:
                'the export takes a second argument, so this gadget draws: it needs `* ui: true` for a widget tree or `* gui: true` for a react component in its header, and action="load_ui" for the language',
        });
        await cleanup();
    });

    test("refuses to create a gadget that draws where there is nothing to draw on", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        const result = await runAction("create_gadget", { reason: WHY, source: UI_GADGET }, ctx);

        expect(result.ok).toBe(false);
        expect(asked).toEqual([]);
        await cleanup();
    });

    test("runs a gadget that draws when there is a ui to draw it on", async () => {
        const { ctx, cleanup } = await context(allow, { ui: async () => ({ branch: "main" }) });

        expect(
            await runAction("create_gadget", { reason: WHY, source: UI_GADGET }, ctx),
        ).toMatchObject({ ok: true });

        expect(await runAction("run_gadget", { name: "pick" }, ctx)).toEqual({
            ok: true,
            content: "on main",
        });
        await cleanup();
    });

    test("refuses to run a gadget that draws where there is nothing to draw on", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(join(dir, "gadgets", "pick.ts"), UI_GADGET);
        ctx.homes = [await loadHome(dir)];

        const result = await runAction("run_gadget", { name: "pick" }, ctx);

        expect(result.ok).toBe(false);
        expect(result.content).toContain("nowhere to show it");
        await cleanup();
    });

    test("runs a gadget that draws a component when there is a window to draw it on", async () => {
        const seen: string[] = [];
        const { ctx, cleanup } = await context(allow, {
            gui: async (file, props) => {
                seen.push(file);
                return { verdict: props.branch };
            },
        });

        expect(
            await runAction("create_gadget", { reason: WHY, source: GUI_GADGET }, ctx),
        ).toMatchObject({ ok: true });

        expect(
            await runAction("run_gadget", { name: "review", input: '{"branch":"main"}' }, ctx),
        ).toEqual({
            ok: true,
            content: '{"verdict":"main"}',
        });
        expect(seen).toHaveLength(1);
        await cleanup();
    });

    test("commits a gadget that draws a component as the tsx its header calls for", async () => {
        const { ctx, dir, cleanup } = await context(allow, { gui: async () => ({}) });

        await runAction("create_gadget", { reason: WHY, source: GUI_GADGET }, ctx);

        expect(await Bun.file(join(dir, "gadgets", "review.tsx")).exists()).toBe(true);
        await cleanup();
    });

    test("refuses to run a gadget that draws a component where there is no window", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(join(dir, "gadgets", "review.tsx"), GUI_GADGET);
        ctx.homes = [await loadHome(dir)];

        const result = await runAction("run_gadget", { name: "review" }, ctx);

        expect(result.ok).toBe(false);
        expect(result.content).toContain("nowhere to show it");
        await cleanup();
    });

    test("refuses to create a gadget that draws a component where there is no window", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction("create_gadget", { reason: WHY, source: GUI_GADGET }, ctx);

        expect(result).toEqual({
            ok: false,
            content:
                "this run has no window to draw a react component in, so one that draws would never be seen",
        });
        await cleanup();
    });

    test("refuses to run a widget gadget in a window, because a widget tree has no terminal to draw in", async () => {
        const { ctx, dir, cleanup } = await context(allow, { gui: async () => ({}) });
        await Bun.write(join(dir, "gadgets", "pick.ts"), UI_GADGET);
        ctx.homes = [await loadHome(dir)];

        const result = await runAction("run_gadget", { name: "pick" }, ctx);

        expect(result.ok).toBe(false);
        expect(result.content).toContain("nowhere to show it");
        await cleanup();
    });

    test("describes a react component to a model that has a window", async () => {
        const { ctx, cleanup } = await context(allow, { gui: async () => ({}) });

        const result = await runAction("load_ui", {}, ctx);

        expect(result.content).toContain("export function View");
        await cleanup();
    });

    test("keeps describing a widget tree to a model with a terminal", async () => {
        const { ctx, cleanup } = await context(allow, { ui: async () => ({}) });

        const result = await runAction("load_ui", {}, ctx);

        expect(result.content).toContain('kind: "select"');
        await cleanup();
    });

    test("hands what one gadget left in the session to the next", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "remember.ts"),
            "/**\n * name: remember\n * description: remembers who\n */\n\nexport default async (input: { who: string }, _ui: unknown, state: State) => {\n    await state.session.set('who', { name: input.who })\n    return 'remembered'\n}\n",
        );
        await Bun.write(
            join(dir, "gadgets", "recall.ts"),
            "/**\n * name: recall\n * description: recalls who\n */\n\nexport default async (_input: unknown, _ui: unknown, state: State) => JSON.stringify(await state.session.get('who'))\n",
        );
        ctx.homes = [await loadHome(dir)];

        await runAction("run_gadget", { name: "remember", input: '{"who":"ada"}' }, ctx);

        expect(await runAction("run_gadget", { name: "recall" }, ctx)).toEqual({
            ok: true,
            content: '{"name":"ada"}',
        });
        await cleanup();
    });

    test("keeps a commit in the home the gadget came from", async () => {
        const { ctx, dir, cleanup } = await context();
        const other = await mkdtemp(join(tmpdir(), "jeng-other-"));
        await Bun.write(
            join(other, "gadgets", "keep.ts"),
            "/**\n * name: keep\n * description: keeps a note\n */\n\nexport default async (_input: unknown, _ui: unknown, state: State) => {\n    await state.persistent.set('note', 'ada')\n    return 'kept'\n}\n",
        );
        ctx.homes = [await loadHome(dir), await loadHome(other)];

        expect(await runAction("run_gadget", { name: "keep" }, ctx)).toMatchObject({ ok: true });

        expect(await Bun.file(join(other, ".state")).text()).toContain('"note": "ada"');
        expect(await Bun.file(join(dir, ".state")).exists()).toBe(false);
        await rm(other, { recursive: true, force: true });
        await cleanup();
    });

    test("test_gadget runs a gadget and leaves nothing behind to run it again", async () => {
        const { ctx, cleanup } = await context();
        const source =
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string }) => "hi " + input.who\n';

        const result = await runAction(
            "test_gadget",
            { reason: WHY, source, input: '{"who":"world"}' },
            ctx,
        );

        expect(result.ok).toBe(true);
        await cleanup();
    });

    test("hands the tested gadget's output back to the model", async () => {
        const { ctx, cleanup } = await context();
        const source =
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string }) => "hi " + input.who\n';

        const result = await runAction(
            "test_gadget",
            { reason: WHY, source, input: '{"who":"world"}' },
            ctx,
        );

        expect(result.content).toContain("hi world");
        await cleanup();
    });

    test("runs a tested gadget that imports a package, installed where it runs", async () => {
        const { ctx, dir, cleanup } = await context();
        const source =
            '/**\n * name: parity\n * description: uses a package\n */\n\nimport isOdd from "is-odd"\n\nexport default async () => String(isOdd(3))\n';

        const result = await runAction(
            "test_gadget",
            { reason: WHY, source, dependencies: ["is-odd"] },
            ctx,
        );

        expect(result.content).toContain("true");
        expect(await Bun.file(join(dir, "package.json")).exists()).toBe(false);
        await cleanup();
    });

    test("saves nothing when a gadget was only tested", async () => {
        const { ctx, cleanup } = await context();
        const source =
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string }) => "hi " + input.who\n';

        await runAction("test_gadget", { reason: WHY, source, input: '{"who":"world"}' }, ctx);

        expect(ctx.homes[0].gadgets).toEqual([]);
        await cleanup();
    });

    test("leaves no gadget file behind after a test", async () => {
        const { ctx, dir, cleanup } = await context();
        const source =
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string }) => "hi " + input.who\n';

        await runAction("test_gadget", { reason: WHY, source, input: '{"who":"world"}' }, ctx);

        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).exists()).toBe(false);
        await cleanup();
    });

    test("tells the model a tested gadget is still only a draft", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction("test_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(result.content).toContain('gadget "greet" ran but was not saved');
        await cleanup();
    });

    test("puts the gadget it is about to run to the user as a test", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        await runAction("test_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(asked).toEqual([
            { kind: "test gadget", name: "greet", source: GADGET, reason: WHY },
        ]);
        await cleanup();
    });

    test("runs nothing when the user turns a test run down", async () => {
        const { ctx, dir, cleanup } = await context(turnsDownFirst("not right now").approve);
        const marker = join(dir, "it-ran");
        const runs =
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async () => { await Bun.write(" +
            JSON.stringify(marker) +
            ', "yes"); return "hi" }\n';

        const result = await runAction("test_gadget", { reason: WHY, source: runs }, ctx);

        expect(result.ok).toBe(false);
        expect(result.content).toContain('the user rejected test gadget "greet": not right now');
        expect(await Bun.file(marker).exists()).toBe(false);
        await cleanup();
    });

    test("never asks to run a gadget the model gave no reason for", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });

        const result = await runAction("test_gadget", { source: GADGET }, ctx);

        expect(result.ok).toBe(false);
        expect(asked).toEqual([]);
        await cleanup();
    });

    test("never asks to run a gadget that would not compile", async () => {
        const asked: Approval[] = [];
        const { ctx, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });
        const broken = "/**\n * name: greet\n * description: says hi\n */\n\nexport default (\n";

        await runAction("test_gadget", { reason: WHY, source: broken }, ctx);

        expect(asked).toEqual([]);
        await cleanup();
    });

    test("delete_gadget takes the gadget out of the home", async () => {
        const { ctx, cleanup } = await context();
        await Bun.write(join(ctx.cwd, "gadgets", "greet.ts"), GADGET);
        ctx.homes = [await loadHome(ctx.cwd)];

        const result = await runAction(
            "delete_gadget",
            { name: "greet", reason: "it does nothing i want" },
            ctx,
        );

        expect(result.ok).toBe(true);
        await cleanup();
    });

    test("leaves no gadget file behind after a deletion", async () => {
        const { ctx, cleanup } = await context();
        await Bun.write(join(ctx.cwd, "gadgets", "greet.ts"), GADGET);
        ctx.homes = [await loadHome(ctx.cwd)];

        await runAction("delete_gadget", { name: "greet", reason: "it does nothing i want" }, ctx);

        expect(await Bun.file(join(ctx.cwd, "gadgets", "greet.ts")).exists()).toBe(false);
        await cleanup();
    });

    test("stops offering a gadget that was deleted", async () => {
        const { ctx, cleanup } = await context();
        await Bun.write(join(ctx.cwd, "gadgets", "greet.ts"), GADGET);
        ctx.homes = [await loadHome(ctx.cwd)];

        await runAction("delete_gadget", { name: "greet", reason: "it does nothing i want" }, ctx);

        expect(ctx.homes[0].gadgets).toEqual([]);
        await cleanup();
    });

    test("puts the whole gadget to the user before it goes, because it is the only copy", async () => {
        const asked: Approval[] = [];
        const { ctx, dir, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });
        await Bun.write(join(dir, "gadgets", "greet.ts"), GADGET);
        ctx.homes = [await loadHome(dir)];

        await runAction("delete_gadget", { name: "greet", reason: "it does nothing i want" }, ctx);

        expect(asked).toEqual([
            {
                kind: "delete gadget",
                name: "greet",
                source: GADGET,
                reason: "it does nothing i want",
            },
        ]);
        await cleanup();
    });

    test("keeps a package another gadget in the home is still importing", async () => {
        const { ctx, dir, cleanup } = await context();
        const source = await gadgetImporting(dir, "parse");
        await Bun.write(join(dir, "gadgets", "parse.ts"), source);
        await Bun.write(join(dir, "gadgets", "greet.ts"), GADGET);
        await Bun.$`bun add jeng-local-pkg@file:./pkg`.cwd(dir).quiet();
        ctx.homes = [await loadHome(dir)];

        await runAction("delete_gadget", { name: "greet", reason: "it is noise" }, ctx);

        const manifest = await Bun.file(join(dir, "package.json")).json();
        expect(manifest).toEqual({ dependencies: { "jeng-local-pkg": "file:./pkg" } });
        await cleanup();
    });

    test("takes a package out with the last gadget that was importing it", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(join(dir, "gadgets", "parse.ts"), await gadgetImporting(dir, "parse"));
        await Bun.$`bun add jeng-local-pkg@file:./pkg`.cwd(dir).quiet();
        ctx.homes = [await loadHome(dir)];

        await runAction("delete_gadget", { name: "parse", reason: "it is noise" }, ctx);

        expect(await Bun.file(join(dir, "package.json")).json()).toEqual({});
        await cleanup();
    });

    test("says what went with the gadget rather than only that it went", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(join(dir, "gadgets", "parse.ts"), await gadgetImporting(dir, "parse"));
        await Bun.$`bun add jeng-local-pkg@file:./pkg`.cwd(dir).quiet();
        ctx.homes = [await loadHome(dir)];

        const result = await runAction(
            "delete_gadget",
            { name: "parse", reason: "it is noise" },
            ctx,
        );

        expect(result.content).toContain("jeng-local-pkg");
        await cleanup();
    });

    test("keeps the gadget when the user turns the deletion down, and says nothing went", async () => {
        const { ctx, dir, cleanup } = await context(
            turnsDownFirst("i still want that one").approve,
        );
        await Bun.write(join(dir, "gadgets", "greet.ts"), GADGET);
        ctx.homes = [await loadHome(dir)];

        const result = await runAction(
            "delete_gadget",
            { name: "greet", reason: "it does nothing i want" },
            ctx,
        );

        expect(result).toEqual({
            ok: false,
            content:
                'the user rejected delete gadget "greet": i still want that one. Nothing was deleted. Do something else, or say so with end.',
        });
        expect(ctx.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        await cleanup();
    });

    test("never asks about a deletion the model gave no reason for", async () => {
        const asked: Approval[] = [];
        const { ctx, dir, cleanup } = await context(async (request) => {
            asked.push(request);
            return { approved: true };
        });
        await Bun.write(join(dir, "gadgets", "greet.ts"), GADGET);
        ctx.homes = [await loadHome(dir)];

        const result = await runAction("delete_gadget", { name: "greet" }, ctx);

        expect(result.ok).toBe(false);
        expect(asked).toEqual([]);
        await cleanup();
    });

    test("delete_gadget reports a gadget that is not there", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("delete_gadget", { name: "nope", reason: "junk" }, ctx)).toEqual({
            ok: false,
            content: 'no gadget named "nope"',
        });
        await cleanup();
    });

    test("deleting from another home takes it out of that home rather than the first", async () => {
        const { ctx, cleanup } = await context();
        const other = await mkdtemp(join(tmpdir(), "jeng-other-"));
        await Bun.write(join(other, "gadgets", "peek.ts"), GADGET.replace("greet", "peek"));
        ctx.homes.push(await loadHome(other));

        const result = await runAction(
            "delete_gadget",
            { name: "peek", reason: "it was only ever a probe" },
            ctx,
        );

        expect(result.ok).toBe(true);
        expect(ctx.homes[1].gadgets).toEqual([]);
        await rm(other, { recursive: true, force: true });
        await cleanup();
    });

    test("delete_protocol takes the memory out of the home", async () => {
        const { ctx, dir, cleanup } = await context();
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        const result = await runAction(
            "delete_protocol",
            { name: "deploy", reason: "we use make ship now" },
            ctx,
        );

        expect(result.ok).toBe(true);
        expect(await Bun.file(join(dir, "protocols", "deploy.md")).exists()).toBe(false);
        expect(ctx.homes[0].protocols).toEqual([]);
        await cleanup();
    });

    test("keeps the protocol when the user keeps the memory", async () => {
        const { ctx, dir, cleanup } = await context(
            turnsDownFirst("that is right, leave it").approve,
        );
        await Bun.write(
            join(dir, "protocols", "deploy.md"),
            "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make\n",
        );
        ctx.homes = [await loadHome(dir)];

        await runAction("delete_protocol", { name: "deploy", reason: "we use make ship now" }, ctx);

        expect(ctx.homes[0].protocols.map((protocol) => protocol.name)).toEqual(["deploy"]);
        await cleanup();
    });

    test("a working run cannot create a gadget, however well it is written", async () => {
        const { ctx, dir, cleanup } = await context();

        const result = await runAction(
            "create_gadget",
            { name: "greet", reason: WHY, source: GADGET },
            { ...ctx, mode: "work" },
        );

        expect(result.ok).toBe(false);
        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).exists()).toBe(false);
        await cleanup();
    });

    test("a working run is told which mode would let it", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction(
            "create_protocol",
            { name: "deploy" },
            {
                ...ctx,
                mode: "work",
            },
        );

        expect(result.content).toContain("learn-mode action");
        await cleanup();
    });

    test("a working run cannot throw away what it was given either", async () => {
        const { ctx, dir, cleanup } = await context();
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        const result = await runAction(
            "delete_protocol",
            { name: "deploy", reason: "we use make ship now" },
            { ...ctx, mode: "work" },
        );

        expect(result.ok).toBe(false);
        expect(await Bun.file(join(dir, "protocols", "deploy.md")).exists()).toBe(true);
        await cleanup();
    });

    test("a working run is never offered the ui language", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction("load_ui", {}, { ...ctx, mode: "work" });

        expect(result.ok).toBe(false);
        await cleanup();
    });

    test("a working run still uses what the home already holds", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async () => 'hi'\n",
        );
        const working = { ...ctx, mode: "work" as const, homes: [await loadHome(dir)] };

        const result = await runAction("run_gadget", { name: "greet" }, working);

        expect(result).toEqual({ ok: true, content: "hi" });
        await cleanup();
    });

    test("an unknown action lists only what this mode can do", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction("publish", {}, { ...ctx, mode: "work" });

        expect(result.content).toContain("Available: run_gadget, load_protocol, end, compact");
        await cleanup();
    });
});
