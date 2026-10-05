import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHome } from "../../src/home";

describe("home", () => {
    test("describes gadgets and protocols found in the home folder", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-home-"));
        await Bun.write(join(dir, "AGENTS.md"), "be careful\n");
        await Bun.write(
            join(dir, "gadgets", "greet.ts"),
            '/**\n * name: greet\n * description: says hi\n */\n\nexport default () => "hi"\n',
        );
        await Bun.write(
            join(dir, "protocols", "deploy.md"),
            "---\nname: deploy\ndescription: shipping steps\nwhen: deploying\n---\n\npush it\n",
        );

        expect(await loadHome(dir)).toEqual({
            dir,
            agents: "be careful\n",
            gadgets: [
                {
                    name: "greet",
                    description: "says hi",
                    when: "",
                    file: join(dir, "gadgets", "greet.ts"),
                    ui: false,
                    gui: false,
                },
            ],
            protocols: [
                {
                    name: "deploy",
                    description: "shipping steps",
                    when: "deploying",
                    file: join(dir, "protocols", "deploy.md"),
                    ui: false,
                    gui: false,
                },
            ],
        });
        await rm(dir, { recursive: true, force: true });
    });

    test("treats an empty home folder as having nothing in it", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-home-"));

        expect(await loadHome(dir)).toEqual({ dir, agents: undefined, gadgets: [], protocols: [] });
        await rm(dir, { recursive: true, force: true });
    });

    test("marks a gadget that says it draws as one that draws", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-home-"));
        await Bun.write(
            join(dir, "gadgets", "pick.ts"),
            "/**\n * name: pick\n * ui: true\n * description: asks\n */\n\nexport default () => {}\n",
        );

        expect((await loadHome(dir)).gadgets[0].ui).toBe(true);
        await rm(dir, { recursive: true, force: true });
    });

    test("picks up a gadget that draws jsx, because it is written as tsx", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-home-"));
        await Bun.write(
            join(dir, "gadgets", "review.tsx"),
            "/**\n * name: review\n * gui: true\n * description: asks\n */\n\nexport function View() { return null }\n\nexport default () => 'ok'\n",
        );

        expect((await loadHome(dir)).gadgets[0]).toMatchObject({ name: "review", gui: true });
        await rm(dir, { recursive: true, force: true });
    });
});
