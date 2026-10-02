import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config";

async function scratch(config?: unknown): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-config-"));
    if (config !== undefined) await Bun.write(join(dir, "jeng.json"), JSON.stringify(config));
    return dir;
}

const defaults = { baseUrl: "http://localhost:11434/v1", apiKey: undefined, model: "gpt-4o-mini" };

describe("config", () => {
    test("falls back to the default home and model when nothing is configured", async () => {
        const cwd = await scratch();

        const config = await loadConfig({ cwd, env: {} });

        expect(config.model).toEqual(defaults);
        expect(config.homes).toHaveLength(1);
        expect(config.homes[0]).toEndWith(".jeng");
        await rm(cwd, { recursive: true, force: true });
    });

    test("reads the home and the model from the environment when no config file exists", async () => {
        const cwd = await scratch();

        const config = await loadConfig({
            cwd,
            env: {
                JENG_HOME: "/c;/d",
                JENG_BASE_URL: "http://host/v1/",
                JENG_API_KEY: "k",
                JENG_MODEL: "qwen",
            },
        });

        expect(config).toEqual({
            homes: ["/c", "/d"],
            model: { baseUrl: "http://host/v1", apiKey: "k", model: "qwen" },
        });
        await rm(cwd, { recursive: true, force: true });
    });

    test("loads the homes and the model from the file named by --config", async () => {
        const cwd = await scratch({
            homes: ["/a", "/b"],
            model: { baseUrl: "http://host/v1/", apiKey: "k", model: "qwen" },
        });

        const config = await loadConfig({ path: join(cwd, "jeng.json"), cwd, env: {} });

        expect(config).toEqual({
            homes: ["/a", "/b"],
            model: { baseUrl: "http://host/v1", apiKey: "k", model: "qwen" },
        });
        await rm(cwd, { recursive: true, force: true });
    });

    test("picks up ./jeng.json without being pointed at it", async () => {
        const cwd = await scratch({ model: { model: "found-me" } });

        const config = await loadConfig({ cwd, env: {} });

        expect(config.model.model).toBe("found-me");
        await rm(cwd, { recursive: true, force: true });
    });

    test("picks up jeng.json sitting inside the first home", async () => {
        const cwd = await scratch();
        const home = await scratch({ model: { model: "this-one" } });

        const config = await loadConfig({ cwd, homeArgs: [home], env: {} });

        expect(config.model.model).toBe("this-one");
        await rm(cwd, { recursive: true, force: true });
        await rm(home, { recursive: true, force: true });
    });

    test("ignores the environment entirely once a config file is loaded", async () => {
        const cwd = await scratch({ model: { model: "from-file" } });

        const config = await loadConfig({
            cwd,
            env: { JENG_BASE_URL: "http://host/v1", JENG_API_KEY: "k", JENG_MODEL: "from-env" },
        });

        expect(config.model).toEqual({ ...defaults, model: "from-file" });
        await rm(cwd, { recursive: true, force: true });
    });

    test("falls back to the default model for every key the file leaves out", async () => {
        const cwd = await scratch({ model: { apiKey: "k" } });

        const config = await loadConfig({ cwd, env: {} });

        expect(config.model).toEqual({ ...defaults, apiKey: "k" });
        await rm(cwd, { recursive: true, force: true });
    });

    test("prefers --home over the homes listed in the config file", async () => {
        const cwd = await scratch({ homes: ["/a", "/b"] });

        const config = await loadConfig({ cwd, homeArgs: ["/override"], env: {} });

        expect(config.homes).toEqual(["/override"]);
        await rm(cwd, { recursive: true, force: true });
    });

    test("expands ~ and resolves relative homes against the config file's own folder", async () => {
        const cwd = await scratch({ homes: ["~/.jeng", "nested"] });

        const config = await loadConfig({ cwd, env: {} });

        expect(config.homes).toEqual([
            join(require("node:os").homedir(), ".jeng"),
            join(cwd, "nested"),
        ]);
        await rm(cwd, { recursive: true, force: true });
    });

    test("throws when --config points at a file that isn't there", async () => {
        const cwd = await scratch();

        expect(loadConfig({ path: join(cwd, "nope.json"), cwd, env: {} })).rejects.toThrow(
            "config file not found",
        );
        await rm(cwd, { recursive: true, force: true });
    });

    test("throws when the config file isn't valid json", async () => {
        const cwd = await scratch();
        await Bun.write(join(cwd, "jeng.json"), "{ not json");

        expect(loadConfig({ cwd, env: {} })).rejects.toThrow(
            `invalid config at ${join(cwd, "jeng.json")}`,
        );
        await rm(cwd, { recursive: true, force: true });
    });

    test("throws when homes is not an array of paths", async () => {
        const cwd = await scratch({ homes: "/a" });

        expect(loadConfig({ cwd, env: {} })).rejects.toThrow("homes must be an array of paths");
        await rm(cwd, { recursive: true, force: true });
    });

    test("throws on a model field that isn't a string", async () => {
        const cwd = await scratch({ model: { model: 7 } });

        expect(loadConfig({ cwd, env: {} })).rejects.toThrow("model.model must be a string");
        await rm(cwd, { recursive: true, force: true });
    });
});
