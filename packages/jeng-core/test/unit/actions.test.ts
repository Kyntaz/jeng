import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActionContext, runAction } from "../../src/actions";
import type { Approval, Approve } from "../../src/approve";
import { loadHome } from "../../src/home";
import { sessionState } from "../../src/state";
import type { Ui } from "../../src/ui";

const allow: Approve = async () => ({ approved: true });

async function context(
    approve: Approve = allow,
    ui?: Ui,
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
            ui,
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

const WHY = "so i can say hi for you";

describe("actions", () => {
    test("create_protocol writes the protocol and makes it available", async () => {
        const { ctx, cleanup } = await context();

        const result = await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        expect(result.ok).toBe(true);
        expect(ctx.homes[0].protocols.map((protocol) => protocol.name)).toEqual(["deploy"]);
        await cleanup();
    });

    test("create_protocol refuses to overwrite an existing protocol", async () => {
        const { ctx, cleanup } = await context();
        await runAction(
            "create_protocol",
            { name: "deploy", description: "how we ship", when: "deploying", content: "run make" },
            ctx,
        );

        expect(
            await runAction(
                "create_protocol",
                { name: "deploy", description: "other", when: "later", content: "x" },
                ctx,
            ),
        ).toEqual({
            ok: false,
            content: 'protocol "deploy" already exists',
        });
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
        expect(ctx.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        await cleanup();
    });

    test("create_gadget rejects a gadget that does not compile and leaves no trace", async () => {
        const { ctx, dir, cleanup } = await context();
        const source =
            "/**\n * name: broken\n * description: nope\n */\n\nexport default () => {\n";

        const result = await runAction(
            "create_gadget",
            { name: "broken", reason: WHY, source },
            ctx,
        );

        expect(result.ok).toBe(false);
        expect(await Bun.file(join(dir, "gadgets", "broken.ts")).exists()).toBe(false);
        expect(ctx.homes[0].gadgets).toEqual([]);
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

    test("run_gadget rejects an unknown gadget by name", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("run_gadget", { name: "nope" }, ctx)).toEqual({
            ok: false,
            content: 'no gadget named "nope"',
        });
        await cleanup();
    });

    test("run_gadget passes a json string input on as an object", async () => {
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

    test("run_gadget finds the gadget a model left inside input, and the gadget never sees the name", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            // biome-ignore lint/suspicious/noTemplateCurlyInString: gadget source, not a template
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string }) => `hi ${input.who} ${JSON.stringify(input)}`\n",
        );
        ctx.homes = [await loadHome(dir)];

        const result = await runAction(
            "run_gadget",
            { input: { name: "greet", who: "world" } },
            ctx,
        );

        expect(result).toEqual({ ok: true, content: 'hi world {"who":"world"}' });
        await cleanup();
    });

    test("run_gadget keeps the name it was given over one left inside input", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async () => 'hi from greet'\n",
        );
        await Bun.write(
            join(dir, "gadgets", "farewell.ts"),
            "/**\n * name: farewell\n * description: says bye\n */\n\nexport default async () => 'bye from farewell'\n",
        );
        ctx.homes = [await loadHome(dir)];

        const result = await runAction(
            "run_gadget",
            { name: "greet", input: { name: "farewell" } },
            ctx,
        );

        expect(result).toEqual({ ok: true, content: "hi from greet" });
        await cleanup();
    });

    test("run_gadget leaves an input name that is no gadget alone", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("run_gadget", { input: { name: "nope" } }, ctx)).toEqual({
            ok: false,
            content: 'no gadget named ""',
        });
        await cleanup();
    });

    test("run_gadget rejects an input string that is not json", async () => {
        const { ctx, dir, cleanup } = await context();
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            "/**\n * name: greet\n * description: says hi\n */\n\nexport default async () => 'hi'\n",
        );
        ctx.homes = [await loadHome(dir)];

        expect(await runAction("run_gadget", { name: "greet", input: "world" }, ctx)).toEqual({
            ok: false,
            content: "input must be a json object, not a string",
        });
        await cleanup();
    });

    test("names a gadget after its own header, not the name the model passed", async () => {
        const { ctx, dir, cleanup } = await context();

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
        expect(ctx.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).exists()).toBe(true);
        await cleanup();
    });

    test("lets a gadget be rewritten, since the model cannot edit files itself", async () => {
        const { ctx, dir, cleanup } = await context();
        const broken = GADGET;
        const fixed =
            "/**\n * name: greet\n * description: says hi properly\n */\n\nexport default async () => 'hello'\n";

        await runAction("create_gadget", { reason: WHY, source: broken }, ctx);
        const result = await runAction("create_gadget", { reason: WHY, source: fixed }, ctx);

        expect(result.ok).toBe(true);
        expect(result.content).toContain('gadget "greet" rewritten');
        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).text()).toBe(fixed);
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
                'unknown action "teleport". Available: run_gadget, test_gadget, load_protocol, load_ui, create_protocol, create_gadget, delete_gadget, delete_protocol, end, compact',
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

    test("writes nothing when the user turns the gadget down, and tells the model why", async () => {
        const user = turnsDownFirst("it deletes files");
        const { ctx, dir, cleanup } = await context(user.approve);

        const result = await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(result).toEqual({
            ok: false,
            content:
                'the user rejected create gadget "greet": it deletes files. Change it and ask again.',
        });
        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).exists()).toBe(false);
        expect(ctx.homes[0].gadgets).toEqual([]);
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
        const { ctx, cleanup } = await context(allow, async () => ({}));
        const undeclared =
            '/**\n * name: pick\n * description: asks\n */\n\nexport default async (input: unknown, ui) => "hi"\n';

        const result = await runAction("create_gadget", { reason: WHY, source: undeclared }, ctx);

        expect(result).toEqual({
            ok: false,
            content:
                'the export takes a second argument, so this gadget draws an interface: it needs `* ui: true` in its header, and action="load_ui" for the language',
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
        const { ctx, cleanup } = await context(allow, async () => ({ branch: "main" }));

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

        await runAction("run_gadget", { name: "remember", input: { who: "ada" } }, ctx);

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
        const { ctx, dir, cleanup } = await context();
        const source =
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default async (input: { who: string }) => "hi " + input.who\n';

        const result = await runAction(
            "test_gadget",
            { reason: WHY, source, input: { who: "world" } },
            ctx,
        );

        expect(result.ok).toBe(true);
        expect(result.content).toContain("hi world");
        expect(ctx.homes[0].gadgets).toEqual([]);
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
        const { ctx, dir, cleanup } = await context();
        await Bun.write(join(dir, "gadgets", "greet.ts"), GADGET);
        ctx.homes = [await loadHome(dir)];

        const result = await runAction(
            "delete_gadget",
            { name: "greet", reason: "it does nothing i want" },
            ctx,
        );

        expect(result.ok).toBe(true);
        expect(await Bun.file(join(dir, "gadgets", "greet.ts")).exists()).toBe(false);
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
