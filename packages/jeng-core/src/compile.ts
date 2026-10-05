import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cache = join(tmpdir(), "jeng-gadgets");

/**
 * React is resolved against jeng rather than against the gadget, because a home folder
 * is a folder of scripts and has no `node_modules` in it to resolve anything from.
 */
const REACT_FROM = import.meta.dir;

const react: Bun.BunPlugin = {
    name: "jeng-react",
    setup(build) {
        build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => ({
            path: Bun.resolveSync(args.path, REACT_FROM),
        }));
    },
};

/**
 * A gadget that draws a component is jsx, which bun will not run straight from a home
 * folder: its jsx runtime has to be resolved from there, and there is nothing there to
 * resolve. So it is compiled once into a file of its own, and that is what runs. The
 * component is not drawn from this copy at all — the window bundles the same source
 * again, with a browser to draw it in.
 */
export async function compileGadget(file: string): Promise<string> {
    const built = await Bun.build({
        entrypoints: [file],
        target: "bun",
        format: "esm",
        plugins: [react],
    });
    if (!built.success) {
        const detail = built.logs.map((log) => String(log.message)).join("\n");
        throw new Error(detail || `${file} does not compile`);
    }

    await mkdir(cache, { recursive: true });
    // Named after the source, so a rewritten gadget is a different module rather than a
    // stale one, and so two gadgets never share a cache entry.
    const out = join(cache, `${createHash("sha256").update(file).digest("hex").slice(0, 16)}.js`);
    await Bun.write(out, built.outputs[0]);
    return out;
}
