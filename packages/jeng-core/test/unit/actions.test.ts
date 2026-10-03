import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActionContext, runAction } from "../../src/actions";
import type { Approval, Approve } from "../../src/approve";
import { loadHome } from "../../src/home";

const allow: Approve = async () => ({ approved: true });

async function context(approve: Approve = allow): Promise<{
    ctx: ActionContext;
    dir: string;
    cleanup: () => Promise<void>;
}> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-actions-"));
    return {
        dir,
        ctx: { homes: [await loadHome(dir)], cwd: dir, approve },
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

    test("an unknown action lists the ones that do exist", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("teleport", {}, ctx)).toEqual({
            ok: false,
            content:
                'unknown action "teleport". Available: run_gadget, load_protocol, create_protocol, create_gadget, end, compact',
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
            { kind: "gadget", name: "greet", source: GADGET, reason: WHY, replacing: false },
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

        expect(asked[1].replacing).toBe(true);
        await cleanup();
    });

    test("writes nothing when the user turns the gadget down, and tells the model why", async () => {
        const user = turnsDownFirst("it deletes files");
        const { ctx, dir, cleanup } = await context(user.approve);

        const result = await runAction("create_gadget", { reason: WHY, source: GADGET }, ctx);

        expect(result).toEqual({
            ok: false,
            content: 'the user rejected gadget "greet": it deletes files. Change it and ask again.',
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
                kind: "protocol",
                name: "deploy",
                source: "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make\n",
                reason: "",
                replacing: false,
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
});
