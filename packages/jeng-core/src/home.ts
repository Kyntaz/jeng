import { statSync } from "node:fs";
import { basename, join } from "node:path";
import { extension, type Header, parseGadget, parseProtocol } from "./header";

export interface GadgetRef {
    name: string;
    description: string;
    when: string;
    file: string;
    /** Whether the gadget draws a widget tree, which is a claim about the user, not the code. */
    ui: boolean;
    /** Whether the gadget draws a react component, which is a claim about the user's window. */
    gui: boolean;
}

type ProtocolRef = GadgetRef;

export interface Home {
    dir: string;
    agents: string | undefined;
    gadgets: GadgetRef[];
    protocols: ProtocolRef[];
}

/** Where a gadget of this name and flavour belongs, which its header alone decides. */
export const gadgetFile = (dir: string, name: string, header: Header): string =>
    join(dir, "gadgets", `${name}.${extension(header)}`);

const isDirectory = (path: string) => {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
};

async function describe(
    file: string,
    folder: "gadgets" | "protocols",
): Promise<Omit<GadgetRef, "file">> {
    const fallback = basename(file).replace(/\.[^.]+$/, "");
    const source = await Bun.file(file).text();
    const header = folder === "gadgets" ? parseGadget(source) : parseProtocol(source)?.header;
    return {
        name: header?.name || fallback,
        description: header?.description ?? "",
        when: header?.when ?? "",
        ui: header?.ui === "true",
        gui: header?.gui === "true",
    };
}

async function collect(
    dir: string,
    folder: "gadgets" | "protocols",
    extensions: string[],
): Promise<GadgetRef[]> {
    const root = join(dir, folder);
    if (!isDirectory(root)) return [];

    const pattern = `*.{${extensions.join(",")}}`;
    const entries = [...new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })].sort();
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
        Bun.file(agents)
            .exists()
            .then((there) => (there ? Bun.file(agents).text() : undefined)),
        // A gadget that draws a react component is jsx, so both extensions are gadgets.
        collect(dir, "gadgets", ["ts", "tsx"]),
        collect(dir, "protocols", ["md"]),
    ]);
    return { dir, agents: agentsText, gadgets, protocols };
}

export async function loadHomes(dirs: string[]): Promise<Home[]> {
    return await Promise.all(dirs.map(loadHome));
}
