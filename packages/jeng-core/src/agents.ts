import { dirname, join, resolve } from "node:path";

export interface AgentsFile {
    dir: string;
    content: string;
}

export async function loadAgentsFiles(cwd: string): Promise<AgentsFile[]> {
    const chain: string[] = [];
    for (let dir = resolve(cwd); ; dir = dirname(dir)) {
        chain.push(dir);
        const parent = dirname(dir);
        if (parent === dir) break;
    }

    const found: AgentsFile[] = [];
    for (const dir of chain.reverse()) {
        const file = join(dir, "AGENTS.md");
        if (await Bun.file(file).exists())
            found.push({ dir, content: await Bun.file(file).text() });
    }
    return found;
}
