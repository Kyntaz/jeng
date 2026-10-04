import { chmod, copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const windows = process.platform === "win32";
const name = windows ? "jeng.exe" : "jeng";
const target = join(homedir(), ".jeng", "bin");
const exe = join(target, name);

async function addToWindowsPath(dir: string) {
    const script = [
        `$bin = '${dir}'`,
        `$path = [Environment]::GetEnvironmentVariable('Path', 'User')`,
        "if (-not $path) { $path = '' }",
        "if (($path -split ';') -notcontains $bin) {",
        "  [Environment]::SetEnvironmentVariable('Path', ($path.TrimEnd(';') + ';' + $bin), 'User')",
        "  Write-Output 'added'",
        "}",
    ].join("\n");
    const process_ = await Bun.spawn(["powershell", "-NoProfile", "-Command", script], {
        stdout: "pipe",
        stderr: "inherit",
    });
    return (await new Response(process_.stdout).text()).includes("added");
}

async function addToUnixPath() {
    const shell = process.env.SHELL?.split("/").pop();
    const preferred = shell === "zsh" ? ".zshrc" : shell === "bash" ? ".bashrc" : undefined;
    const candidates = [preferred, ".zshrc", ".bashrc", ".profile"].filter(
        (file): file is string => file !== undefined,
    );
    let rc = join(homedir(), ".profile");
    for (const candidate of candidates) {
        const file = join(homedir(), candidate);
        if (await Bun.file(file).exists()) {
            rc = file;
            break;
        }
    }
    const line = `export PATH="$HOME/.jeng/bin:$PATH"`;
    const current = (await Bun.file(rc).exists()) ? await Bun.file(rc).text() : "";
    if (current.includes(line)) return false;
    await Bun.write(rc, `${current}${current.endsWith("\n") || !current ? "" : "\n"}${line}\n`);
    return true;
}

await mkdir(target, { recursive: true });

const built = join(import.meta.dir, "..", "dist", name);
if (!(await Bun.file(built).exists()))
    throw new Error(`${built} not found, run bun run build first`);

await copyFile(built, exe);
await chmod(exe, 0o755);

const added = windows ? await addToWindowsPath(target) : await addToUnixPath();

console.log(`${name} installed to ${exe}`);
console.log(
    added ? `Added ${target} to PATH, open a new terminal.` : `${target} is already in PATH.`,
);
