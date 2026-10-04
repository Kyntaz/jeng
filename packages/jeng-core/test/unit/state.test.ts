import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistentState, sessionState } from "../../src/state";

async function home(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-state-"));
    return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe("state", () => {
    test("holds a session value for as long as the session is", async () => {
        const session = sessionState();

        await session.set("draft", { title: "jeng", tags: ["agent"] });

        expect(await session.get("draft")).toEqual({ title: "jeng", tags: ["agent"] });
    });

    test("reads a key a session never set as missing rather than empty", async () => {
        const session = sessionState();

        expect(await session.get("draft")).toBeUndefined();
    });

    test("holds a value json cannot write no better than json does", async () => {
        const session = sessionState();

        await session.set("call", () => "hi");

        expect(await session.get("call")).toBeInstanceOf(Function);
    });

    test("reads a key a home never committed as missing rather than empty", async () => {
        const { dir, cleanup } = await home();

        expect(await persistentState(dir).get("greeted")).toBeUndefined();
        await cleanup();
    });

    test("hands a committed value to a later session over the same home", async () => {
        const { dir, cleanup } = await home();

        await persistentState(dir).set("greeted", ["ada", "grace"]);

        expect(await persistentState(dir).get("greeted")).toEqual(["ada", "grace"]);
        await cleanup();
    });

    test("keeps the other keys when committing one", async () => {
        const { dir, cleanup } = await home();

        await persistentState(dir).set("who", "ada");
        await persistentState(dir).set("where", { repo: "jeng" });

        expect(await persistentState(dir).get("who")).toBe("ada");
        expect(await persistentState(dir).get("where")).toEqual({ repo: "jeng" });
        await cleanup();
    });

    test("refuses a value that would be dropped on the way to disk", async () => {
        const { dir, cleanup } = await home();

        await expect(persistentState(dir).set("count", Number.NaN)).rejects.toThrow(
            'state "count" cannot hold NaN',
        );
        expect(await Bun.file(join(dir, ".state")).exists()).toBe(false);
        await cleanup();
    });

    test("refuses a value that cannot describe itself", async () => {
        const { dir, cleanup } = await home();

        const loop: Record<string, unknown> = {};
        loop.self = loop;

        await expect(persistentState(dir).set("loop", loop)).rejects.toThrow(
            'state "loop" cannot hold a value holding itself',
        );
        await cleanup();
    });

    test("writes the committed keys where a person can read them", async () => {
        const { dir, cleanup } = await home();

        await persistentState(dir).set("greeted", { who: "ada" });

        expect(await Bun.file(join(dir, ".state")).text()).toBe(
            '{\n  "greeted": {\n    "who": "ada"\n  }\n}\n',
        );
        await cleanup();
    });

    test("creates the home folder a commit names rather than losing it", async () => {
        const { dir, cleanup } = await home();
        const fresh = join(dir, "fresh");

        await persistentState(fresh).set("greeted", "ada");

        expect(await Bun.file(join(fresh, ".state")).text()).toContain('"greeted": "ada"');
        await cleanup();
    });

    test("says which file is unreadable rather than reading it as empty", async () => {
        const { dir, cleanup } = await home();
        await Bun.write(join(dir, ".state"), "not json at all");

        await expect(persistentState(dir).get("greeted")).rejects.toThrow(join(dir, ".state"));
        await cleanup();
    });
});
