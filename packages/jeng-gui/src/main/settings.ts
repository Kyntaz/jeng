import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defaultHome } from "@jeng/core";

/**
 * The configs the window knows about and the two things it picked, kept in a plain text
 * file because it is a list of paths a person is expected to read and edit:
 *
 *     cwd: C:/work/jeng
 *     * C:/Users/you/.jeng/jeng.json
 *     C:/Users/you/agents/researcher.json
 *
 * The `cwd:` line is where it works, the `*` marks the config in force and every other
 * line is one it has been shown. Anything else is a comment, and every path is absolute,
 * because that is what a file dialog hands over.
 */
export interface Settings {
    cwd: string;
    /** The config in force, or nothing at all when the environment is. */
    config?: string;
    configs: string[];
}

const FILE = join(defaultHome(), "knownconfigs");

function parse(text: string, cwd: string): Settings {
    const settings: Settings = { cwd, configs: [] };
    for (const line of text.split("\n")) {
        const entry = line.trim();
        if (!entry || entry.startsWith("#")) continue;
        if (entry.startsWith("cwd:")) settings.cwd = entry.slice("cwd:".length).trim();
        else if (entry.startsWith("*")) {
            settings.config = entry.slice(1).trim();
            settings.configs.push(settings.config);
        } else settings.configs.push(entry);
    }
    return settings;
}

function write({ cwd, config, configs }: Settings): string {
    const lines = [`cwd: ${cwd}`];
    for (const path of configs) lines.push(path === config ? `* ${path}` : path);
    if (config && !configs.includes(config)) lines.push(`* ${config}`);
    return `${lines.join("\n")}\n`;
}

async function isDirectory(dir: string): Promise<boolean> {
    try {
        return (await stat(dir)).isDirectory();
    } catch {
        return false;
    }
}

/** A file that isn't there is an empty list rather than an error: there is nothing to forget yet. */
export async function readSettings(cwd: string, file: string = FILE): Promise<Settings> {
    if (!(await Bun.file(file).exists())) return { cwd, configs: [] };
    const settings = parse(await Bun.file(file).text(), cwd);
    // A directory that has been deleted since the window last ran is not worth refusing to
    // start over: the folder jeng was launched from is the one thing certainly still there.
    return { ...settings, cwd: (await isDirectory(settings.cwd)) ? settings.cwd : cwd };
}

export async function saveSettings(settings: Settings, file: string = FILE): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    await Bun.write(file, write(settings));
}
