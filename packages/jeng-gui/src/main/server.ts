import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { DEFAULT_STYLE, STYLES, type Style } from "@jeng/core";
import { roots } from "./style";

/**
 * The source tree, found by walking up to the folder the whole project hangs off.
 *
 * This is here because the main process is bundled into the app while the view and the
 * gadgets are not: a gadget's component is compiled when the window asks for it, which
 * means react has to be resolvable at run time, which means this runs from source rather
 * than from a packaged app. A packaged build would carry its own react instead.
 */
function source(): string {
    const marker = join("packages", "jeng-gui", "src", "view");
    for (let dir = import.meta.dir, up = 0; up < 12; up++, dir = dirname(dir))
        if (existsSync(join(dir, marker))) return dir;
    throw new Error("the desktop app has to run from source: no jeng project above it");
}

const ROOT = source();
const VIEW_DIR = join(ROOT, "packages", "jeng-gui", "src", "view");
const VIEW_ENTRY = join(VIEW_DIR, "index.tsx");

// React is jeng's own rather than a gadget's, so it is resolved from the package that
// depends on it instead of from whatever folder the gadget happens to sit in.
const REACT_FROM = join(ROOT, "packages", "jeng-gui");

/**
 * The component is bundled as a `mount` rather than exported as a component, because
 * react is inlined into the chunk: two copies of react must never share one tree, and a
 * gadget that renders its own root cannot accidentally end up inside ours.
 *
 * The gadget is named by a path relative to the wrapper rather than an absolute one,
 * because a drive letter is not a module specifier anything can resolve, and because a
 * relative import is what keeps the gadget's own relative imports working.
 */
const wrapper = (entry: string, file: string) => {
    const specifier = relative(dirname(entry), file).replaceAll("\\", "/");
    return `
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { View } from "./${specifier}";

export function mount(element, props) {
    const root = createRoot(element);
    root.render(createElement(View, props));
    return () => root.unmount();
}
`;
};

const EMPTY = "module.exports = {};";

/**
 * React is jeng's own rather than a gadget's, so it is resolved from the package that
 * depends on it: a home folder is a folder of scripts with no `node_modules` in it to
 * resolve anything from.
 */
const react: Bun.BunPlugin = {
    name: "jeng-react",
    setup(build) {
        build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => ({
            path: Bun.resolveSync(args.path, REACT_FROM),
        }));
    },
};

/** `node:` is dropped rather than refused, so a gadget's bun half can still use it. */
const node: Bun.BunPlugin = {
    name: "jeng-no-node",
    setup(build) {
        build.onResolve({ filter: /^node:/ }, () => ({ path: "jeng:empty", namespace: "empty" }));
        build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({
            contents: EMPTY,
            loader: "js",
        }));
    },
};

const plugins = [react, node];

// React ships a development build that checks every prop and is several times the size,
// and nothing here is being developed as a react app: it is a window with a gadget's
// component in it. Minified for the same reason — this is loaded over a loopback socket
// once per gadget, and react is most of what is in it.
const PRODUCTION = {
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
};

async function bundle(entrypoint: string): Promise<string> {
    try {
        const built = await Bun.build({
            entrypoints: [entrypoint],
            format: "esm",
            plugins,
            ...PRODUCTION,
        });
        if (!built.success)
            throw new Error(built.logs.map((log) => String(log.message)).join("\n"));
        return await built.outputs[0].text();
    } catch (error) {
        // Bun rejects with one error per problem rather than a message saying what they
        // are, and a gadget author is going to be reading this.
        const many = (error as { errors?: unknown[] }).errors;
        throw new Error(
            many?.length
                ? many.map((one) => String((one as { message?: string }).message ?? one)).join("\n")
                : (error as Error).message,
        );
    }
}

const shells = new Map<string, string>();
// What a gadget was, held once the file it was in is gone. A `test_gadget` is run out of a
// temp folder that is removed as soon as the turn is over, and the record of it outlives
// that folder: a path is the one thing in a record that can stop existing while the
// record is still on screen.
const kept = new Map<string, string>();
const gadgets = new Map<string, { at?: number; code: string }>();

// Beside the source rather than in the system temp folder, because a wrapper reaches a
// gadget by a relative path and two folders on different drives have no relative path
// between them. A home on another drive is not unusual.
const cache = join(ROOT, ".jeng-gadgets");

const digest = (file: string) => createHash("sha256").update(file).digest("hex").slice(0, 16);

const named = (file: string) => join(cache, `${digest(file)}.js`);

/** Where a kept gadget's source is written, since the wrapper reaches it by path too. */
const pinned = (file: string) => join(cache, `${digest(file)}${extname(file)}`);

/**
 * Hold onto a gadget's source, because the window is going to be asked for it again by a
 * record that outlives the file. Read now, while the file is there: a draft is gone by the
 * time anything needs it a second time. What was built from an earlier reading is dropped,
 * because a gadget rewritten and drawn again is a new file at the same path.
 */
export async function keep(file: string): Promise<void> {
    kept.set(file, await Bun.file(file).text());
    gadgets.delete(file);
}

/** What one conversation was holding, dropped when another takes its place. */
export function forget(): void {
    kept.clear();
    gadgets.clear();
}

/** The window's own files, built once and kept: there are three of them and they never change. */
async function shell(path: string): Promise<string> {
    const cached = shells.get(path);
    if (cached !== undefined) return cached;
    const code = path.endsWith(".tsx") ? await bundle(path) : await Bun.file(path).text();
    shells.set(path, code);
    return code;
}

/**
 * A gadget's chunk, rebuilt only when the file it came from has changed. A rewritten
 * gadget is a different file at the same path, so the timestamp is what tells them
 * apart — unless what is held is what it was when it was drawn, which has no later
 * version to notice.
 */
async function gadget(file: string): Promise<string> {
    const held = kept.get(file);
    const at = held === undefined ? (await stat(file)).mtimeMs : undefined;
    const cached = gadgets.get(file);
    if (cached && cached.at === at) return cached.code;

    await mkdir(cache, { recursive: true });
    const entry = named(file);
    const from = held === undefined ? file : pinned(file);
    if (held !== undefined) await Bun.write(from, held);
    await Bun.write(entry, wrapper(entry, from));

    const code = await bundle(entry);
    gadgets.set(file, { at, code });
    return code;
}

const SCRIPT = { headers: { "content-type": "text/javascript; charset=utf-8" } };
const STYLE = { headers: { "content-type": "text/css; charset=utf-8" } };
const MARKUP = { headers: { "content-type": "text/html; charset=utf-8" } };

/**
 * The window is served rather than bundled, so one `bun build` path covers a dev run
 * and a packaged app and the view can be rebuilt without relaunching the native side.
 * A gadget's component is compiled here on demand, because which gadgets exist is
 * decided by the model writing them and not by anything that ships with the app.
 */
/**
 * The window is served rather than bundled, so one `bun build` path covers a dev run
 * and a packaged app and the view can be rebuilt without relaunching the native side.
 * A gadget's component is compiled here on demand, because which gadgets exist is
 * decided by the model writing them and not by anything that ships with the app.
 *
 * `style` is read per request rather than closed over once, because the picker can swap
 * the config the window is pointed at and a different config can carry a different style.
 * The stylesheet is the one thing that has to follow, since it is the only way the style
 * reaches the page at all.
 */
export function serve(style: () => Style = () => STYLES[DEFAULT_STYLE]): {
    url: string;
    stop: () => void;
} {
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            const { pathname } = new URL(request.url);
            try {
                if (pathname === "/") {
                    return new Response(await shell(join(VIEW_DIR, "index.html")), MARKUP);
                }
                if (pathname === "/view.js") return new Response(await shell(VIEW_ENTRY), SCRIPT);
                // A gadget is served the same stylesheet the window uses, so its
                // component looks like part of the app by using the variables the
                // document already has in scope.
                if (pathname === "/theme.css" || pathname === "/gadget.css")
                    return new Response(
                        `${await shell(join(VIEW_DIR, "theme.css"))}\n${roots(style())}`,
                        STYLE,
                    );
                if (pathname.startsWith("/gadget/")) {
                    const file = decodeURIComponent(pathname.slice("/gadget/".length));
                    return new Response(await gadget(file), SCRIPT);
                }
            } catch (error) {
                // A gadget that will not compile says so in its own card rather than
                // taking the whole window down with it.
                return new Response((error as Error).message, {
                    status: 500,
                    headers: { "content-type": "text/plain; charset=utf-8" },
                });
            }
            return new Response("not found", { status: 404 });
        },
    });

    return {
        url: `http://127.0.0.1:${server.port}/`,
        stop: () => server.stop(true),
    };
}
