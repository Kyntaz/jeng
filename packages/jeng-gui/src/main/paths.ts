import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * An installed app carries the window's files in its `Resources`, because `bun run setup`
 * staged them there; a project carries them as source under its package. A view folder
 * that already holds a bundle is the one and only thing that tells the two apart, since a
 * project's is source waiting to be built.
 */
const staged = (dir: string): boolean => existsSync(join(dir, "view", "view.js"));

const project = (dir: string): boolean =>
    existsSync(join(dir, "packages", "jeng-gui", "src", "view"));

/** The folder above this module that the window's files live in, or nothing if there is none. */
export function above(start: string = import.meta.dir): string | undefined {
    for (let dir = start, up = 0; up < 12; up++, dir = dirname(dir))
        if (staged(dir) || project(dir)) return dir;
    return undefined;
}

/** What the window is served out of, told by which of the two the folder turned out to be. */
export function paths(root: string) {
    const installed = staged(root);
    return {
        view: installed ? join(root, "view") : join(root, "packages", "jeng-gui", "src", "view"),
        entry: installed ? "view.js" : "index.tsx",
        // React is jeng's own rather than a gadget's, so it is resolved from what carries it:
        // a home is a folder of scripts with no `node_modules` in it to resolve anything from.
        react: installed ? root : join(root, "packages", "jeng-gui"),
        // Beside what it belongs to rather than in the system temp folder, since a wrapper
        // reaches a gadget by a relative path and two folders on different drives have none.
        cache: join(root, ".jeng-gadgets"),
        // The icon the window is identified by and the drawing the page asks for, which
        // an install carries beside the staged view rather than inside it.
        assets: join(root, "assets"),
    };
}

const found = above();

if (found === undefined)
    throw new Error(
        "the window has nothing to serve: run bun run setup, or launch the app from the jeng tree",
    );

export const { view, entry, react, cache, assets } = paths(found);
