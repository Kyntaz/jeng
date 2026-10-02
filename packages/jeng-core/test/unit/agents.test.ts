import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentsFiles } from "../../src/agents";

describe("agents", () => {
    test("collects AGENTS.md from the working directory upwards", async () => {
        const root = await mkdtemp(join(tmpdir(), "jeng-agents-"));
        const nested = join(root, "a", "b");
        await Bun.write(join(root, "AGENTS.md"), "top level\n");
        await Bun.write(join(nested, "AGENTS.md"), "nested\n");

        expect(await loadAgentsFiles(nested)).toEqual([
            { dir: root, content: "top level\n" },
            { dir: nested, content: "nested\n" },
        ]);
        await rm(root, { recursive: true, force: true });
    });

    test("skips directories without an AGENTS.md", async () => {
        const root = await mkdtemp(join(tmpdir(), "jeng-agents-"));
        const nested = join(root, "a");
        await Bun.write(join(nested, "AGENTS.md"), "only me\n");

        expect(await loadAgentsFiles(nested)).toEqual([{ dir: nested, content: "only me\n" }]);
        await rm(root, { recursive: true, force: true });
    });
});
