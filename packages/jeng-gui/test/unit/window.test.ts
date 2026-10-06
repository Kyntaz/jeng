import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * `node:` is refused rather than stubbed, which is what `server.ts` does the opposite of
 * for a gadget: a gadget has a bun half that needs it, and the window has nothing that
 * does. Swapping it out would build cleanly and leave something that throws the first
 * time it is called, so this build has to reach no such import at all.
 */
const noNode: Bun.BunPlugin = {
    name: "jeng-refuse-node",
    setup(build) {
        build.onResolve({ filter: /^node:/ }, (args) => {
            throw new Error(`${args.path} reached the window, which is a browser`);
        });
    },
};

const ENTRY = join(import.meta.dir, "..", "..", "src", "view", "index.tsx");

describe("window", () => {
    test("builds without reaching for anything only bun has", async () => {
        const built = await Bun.build({
            entrypoints: [ENTRY],
            format: "esm",
            plugins: [noNode],
        });
        expect(built.success).toBe(true);
    });
});
