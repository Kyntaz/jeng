import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ActionContext, runAction } from "../../src/actions";
import { loadHome } from "../../src/home";

async function context(): Promise<{
    ctx: ActionContext;
    dir: string;
    cleanup: () => Promise<void>;
}> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-actions-"));
    return {
        dir,
        ctx: { homes: [await loadHome(dir)], cwd: dir },
        cleanup: () => rm(dir, { recursive: true, force: true }),
    };
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

        const result = await runAction("create_gadget", { name: "greet", source }, ctx);

        expect(result.ok).toBe(true);
        expect(ctx.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        await cleanup();
    });

    test("create_gadget rejects a gadget that does not compile and leaves no trace", async () => {
        const { ctx, dir, cleanup } = await context();
        const source =
            "/**\n * name: broken\n * description: nope\n */\n\nexport default () => {\n";

        const result = await runAction("create_gadget", { name: "broken", source }, ctx);

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

    test("an unknown action lists the ones that do exist", async () => {
        const { ctx, cleanup } = await context();

        expect(await runAction("teleport", {}, ctx)).toEqual({
            ok: false,
            content:
                'unknown action "teleport". Available: run_gadget, load_protocol, create_protocol, create_gadget',
        });
        await cleanup();
    });
});
