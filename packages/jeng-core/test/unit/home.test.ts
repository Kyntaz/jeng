import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHome, resolveHomes } from "../../src/home";

describe("home", () => {
    test("prefers explicit home arguments over the environment", () => {
        expect(resolveHomes(["/a", "/b"], { JENG_HOME: "/c" })).toEqual(["/a", "/b"]);
    });

    test("splits JENG_HOME so multiple agents can be chained", () => {
        expect(resolveHomes([], { JENG_HOME: "/c;/d" })).toEqual(["/c", "/d"]);
    });

    test("falls back to ~/.jeng when nothing is configured", () => {
        expect(resolveHomes([], {})).toEqual([join(require("node:os").homedir(), ".jeng")]);
    });

    test("describes gadgets and protocols found in the home folder", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-home-"));
        await Bun.write(join(dir, "AGENTS.md"), "be careful\n");
        await Bun.write(join(dir, "gadgets", "greet.ts"), "/**\n * name: greet\n * description: says hi\n */\n\nexport default () => \"hi\"\n");
        await Bun.write(join(dir, "protocols", "deploy.md"), "---\nname: deploy\ndescription: shipping steps\nwhen: deploying\n---\n\npush it\n");

        expect(await loadHome(dir)).toEqual({
            dir,
            agents: "be careful\n",
            gadgets: [{ name: "greet", description: "says hi", when: "", file: join(dir, "gadgets", "greet.ts") }],
            protocols: [{ name: "deploy", description: "shipping steps", when: "deploying", file: join(dir, "protocols", "deploy.md") }],
        });
        await rm(dir, { recursive: true, force: true });
    });

    test("treats an empty home folder as having nothing in it", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-home-"));

        expect(await loadHome(dir)).toEqual({ dir, agents: undefined, gadgets: [], protocols: [] });
        await rm(dir, { recursive: true, force: true });
    });
});