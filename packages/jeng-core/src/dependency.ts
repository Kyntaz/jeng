import { existsSync } from "node:fs";
import { join } from "node:path";

/** Jeng's own rather than a gadget's, so it is never something a home installs. */
const PROVIDED = ["react", "react-dom"];

/**
 * A specifier is a package name unless it is relative, absolute or a builtin. A subpath
 * belongs to the package it hangs off, so `zod/v4` is `zod` and `@scope/pkg/thing` is
 * `@scope/pkg`, which is the name bun writes into a manifest and the name we prune.
 */
export function packageOf(specifier: string): string | undefined {
    if (!specifier) return undefined;
    if (specifier.startsWith(".") || specifier.startsWith("/")) return undefined;
    if (specifier === "bun" || /^(?:node|bun):/.test(specifier)) return undefined;
    const parts = specifier.split("/");
    const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
    return PROVIDED.includes(name) ? undefined : name;
}

/** The name inside what the model was asked to install, so `zod@^4` is `zod`. */
export const nameOf = (spec: string): string => {
    const at = spec.lastIndexOf("@");
    return at > 0 ? spec.slice(0, at) : spec;
};

// Every way a gadget names a module. A scan rather than a parse, which means it can miss a
// specifier built at run time; what it finds is what makes the model say which packages it
// wants, and what the manifest is pruned against.
const SPECIFIERS = /\b(?:from|import|require)\s*\(?\s*["']([^"'\n]+)["']/g;

/** The packages a gadget imports, sorted so a message about them is the same every time. */
export function imported(source: string): string[] {
    const found = [...source.matchAll(SPECIFIERS)].map((match) => packageOf(match[1]));
    return [...new Set(found.filter((name) => name !== undefined))].sort();
}

/** A scan that finds nothing wrong is the cheap kind, so bun's own reason is the one worth keeping. */
function reason(stderr: string, fallback: string): string {
    const lines = stderr.trim().split("\n");
    return (
        lines.find((line) => /error/i.test(line))?.trim() ||
        lines.findLast((line) => line.trim().length > 0)?.trim() ||
        fallback
    );
}

/**
 * The executable itself rather than `bun` off PATH, so a compiled Jeng installs
 * without a separate bun: the binary carries the runtime and this env var makes it
 * the CLI. Run from source it is already bun, and the var is then just noise.
 */
async function bun(cwd: string, args: string[]): Promise<void> {
    const proc = Bun.spawn([process.execPath, ...args], {
        cwd,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
        env: { ...process.env, BUN_BE_BUN: "1" },
    });
    const stderr = new Response(proc.stderr);
    if ((await proc.exited) === 0) return;
    throw new Error(reason(await stderr.text(), `bun ${args.join(" ")} failed`));
}

/**
 * The whole list at once rather than one at a time: a package that does not exist should
 * leave no manifest behind, and one call is the only way to be sure of that.
 */
export async function install(home: string, specs: string[]): Promise<void> {
    if (specs.length === 0) return;
    await bun(home, ["add", ...specs]);
}

async function declared(home: string): Promise<string[]> {
    const file = join(home, "package.json");
    if (!(await Bun.file(file).exists())) return [];
    const { dependencies } = JSON.parse(await Bun.file(file).text());
    return Object.keys(dependencies ?? {});
}

/** What the gadgets left in a home import between them, which is what has to stay installed. */
async function wanted(home: string): Promise<Set<string>> {
    const dir = join(home, "gadgets");
    if (!existsSync(dir)) return new Set();
    const entries = [...new Bun.Glob("*.{ts,tsx}").scanSync({ cwd: dir, onlyFiles: true })];
    const sources = await Promise.all(entries.map((entry) => Bun.file(join(dir, entry)).text()));
    return new Set(sources.flatMap(imported));
}

/**
 * Take out whatever a home installed for a gadget that is no longer there. Read off what
 * the remaining gadgets import rather than off what they declared, so a package another
 * gadget is still using stays however little that gadget said about it.
 */
export async function prune(home: string): Promise<string[]> {
    const kept = await wanted(home);
    const unused = (await declared(home)).filter((name) => !kept.has(name));
    if (unused.length === 0) return [];
    await bun(home, ["remove", ...unused]);
    return unused;
}
