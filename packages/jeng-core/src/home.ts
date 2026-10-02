import { homedir } from "node:os";
import { basename, join } from "node:path";
import { statSync } from "node:fs";
import { parseGadget, parseProtocol } from "./header";

export interface GadgetRef {
    name: string;
    description: string;
    when: string;
    file: string;
}

export type ProtocolRef = GadgetRef;

export interface Home {
    dir: string;
    agents: string | undefined;
    gadgets: GadgetRef[];
    protocols: ProtocolRef[];
}

export function resolveHomes(homeArgs: string[] = [], env: Record<string, string | undefined> = process.env): string[] {
    if (homeArgs.length > 0) return homeArgs;
    if (env.JENG_HOME) return env.JENG_HOME.split(";").filter(Boolean);
    return [join(homedir(), ".jeng")];
}

const isDirectory = (path: string) => {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
};

async function describe(file: string, folder: "gadgets" | "protocols"): Promise<Omit<GadgetRef, "file">> {
    const fallback = basename(file).replace(/\.[^.]+$/, "");
    const source = await Bun.file(file).text();
    const header = folder === "gadgets" ? parseGadget(source) : parseProtocol(source)?.header;
    return { name: header?.name || fallback, description: header?.description ?? "", when: header?.when ?? "" };
}

async function collect(dir: string, folder: "gadgets" | "protocols", extension: string): Promise<GadgetRef[]> {
    const root = join(dir, folder);
    if (!isDirectory(root)) return [];

    const entries = [...new Bun.Glob(`*${extension}`).scanSync({ cwd: root, onlyFiles: true })].sort();
    return await Promise.all(
        entries.map(async (entry) => {
            const file = join(root, entry);
            return { file, ...(await describe(file, folder)) };
        }),
    );
}

export async function loadHome(dir: string): Promise<Home> {
    const agents = join(dir, "AGENTS.md");
    const [agentsText, gadgets, protocols] = await Promise.all([
        (await Bun.file(agents).exists()) ? Bun.file(agents).text() : Promise.resolve(undefined),
        collect(dir, "gadgets", ".ts"),
        collect(dir, "protocols", ".md"),
    ]);
    return { dir, agents: agentsText, gadgets, protocols };
}

export async function loadHomes(dirs: string[]): Promise<Home[]> {
    return await Promise.all(dirs.map(loadHome));
}