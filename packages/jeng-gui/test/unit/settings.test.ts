import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSettings, saveSettings } from "../../src/main/settings";

async function scratch(text?: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-settings-"));
    const file = join(dir, "knownconfigs");
    if (text !== undefined) await Bun.write(file, text);
    return file;
}

describe("the window's own settings", () => {
    test("starts empty when nothing has been written yet", async () => {
        const file = await scratch();

        expect(await readSettings("/work", file)).toEqual({ cwd: "/work", configs: [] });
        await rm(join(file, ".."), { recursive: true, force: true });
    });

    test("reads back the directory it was left working in", async () => {
        const file = await scratch("cwd: /work/jeng\n");

        expect((await readSettings("/elsewhere", file)).cwd).toBe("/work/jeng");
        await rm(join(file, ".."), { recursive: true, force: true });
    });

    test("reads back the config in force and the ones it has merely been shown", async () => {
        const file = await scratch("cwd: /work\n* /a/jeng.json\n/b/jeng.json\n");

        const settings = await readSettings("/elsewhere", file);

        expect(settings.config).toBe("/a/jeng.json");
        expect(settings.configs).toEqual(["/a/jeng.json", "/b/jeng.json"]);
        await rm(join(file, ".."), { recursive: true, force: true });
    });

    test("ignores the comments and blank lines of a file a person is meant to edit", async () => {
        const file = await scratch("# jeng\n\ncwd: /work\n\n  * /a/jeng.json  \n");

        const settings = await readSettings("/elsewhere", file);

        expect(settings).toEqual({
            cwd: "/work",
            config: "/a/jeng.json",
            configs: ["/a/jeng.json"],
        });
        await rm(join(file, ".."), { recursive: true, force: true });
    });

    test("says nothing is in force when no line is marked", async () => {
        const file = await scratch("cwd: /work\n/a/jeng.json\n");

        expect((await readSettings("/work", file)).config).toBeUndefined();
        await rm(join(file, ".."), { recursive: true, force: true });
    });

    test("round trips what it wrote", async () => {
        const file = await scratch();

        await saveSettings(
            { cwd: "/work", config: "/a/jeng.json", configs: ["/a/jeng.json"] },
            file,
        );
        await saveSettings(
            { cwd: "/work", config: "/b/jeng.json", configs: ["/a/jeng.json", "/b/jeng.json"] },
            file,
        );

        expect(await readSettings("/elsewhere", file)).toEqual({
            cwd: "/work",
            config: "/b/jeng.json",
            configs: ["/a/jeng.json", "/b/jeng.json"],
        });
        await rm(join(file, ".."), { recursive: true, force: true });
    });

    test("marks the config in force in the file rather than in a second one", async () => {
        const file = await scratch();

        await saveSettings(
            { cwd: "/work", config: "/b/jeng.json", configs: ["/a/jeng.json", "/b/jeng.json"] },
            file,
        );

        expect(await Bun.file(file).text()).toBe("cwd: /work\n/a/jeng.json\n* /b/jeng.json\n");
        await rm(join(file, ".."), { recursive: true, force: true });
    });
});
