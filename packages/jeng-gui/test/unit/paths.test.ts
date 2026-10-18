import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { above, entry, paths } from "../../src/main/paths";

/** An installed app, with `bun run setup` having already staged what it needs in. */
async function install(): Promise<string> {
    const app = await mkdtemp(join(tmpdir(), "jeng-gui-"));
    const resources = join(app, "Resources");
    await mkdir(join(resources, "view"), { recursive: true });
    await writeFile(join(resources, "view", "view.js"), "export const drawn = 1;\n");
    return app;
}

describe("where the window's own files are", () => {
    test("an install is found from the bundle the main process was built into", async () => {
        const app = await install();
        try {
            expect(above(join(app, "Resources", "app", "bun"))).toBe(join(app, "Resources"));
        } finally {
            await rm(app, { recursive: true, force: true });
        }
    });

    test("an install serves the bundle it carries rather than building one", async () => {
        const app = await install();
        try {
            expect(paths(join(app, "Resources")).entry).toBe("view.js");
        } finally {
            await rm(app, { recursive: true, force: true });
        }
    });

    test("an install resolves react from its own node_modules", async () => {
        const app = await install();
        try {
            const { react, view } = paths(join(app, "Resources"));
            expect([react, view]).toEqual([join(app, "Resources"), join(app, "Resources", "view")]);
        } finally {
            await rm(app, { recursive: true, force: true });
        }
    });

    test("a project is found from the source the main process was built from", () => {
        expect(above(join(import.meta.dir, "main"))).toBe(
            join(import.meta.dir, "..", "..", "..", ".."),
        );
    });

    test("a project builds the view from its entry, since that is all it has", () => {
        expect(entry).toBe("index.tsx");
    });
});
