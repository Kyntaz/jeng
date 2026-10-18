import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const windows = process.platform === "win32";
const macos = process.platform === "darwin";
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
    added ? `Added ${target} to PATH, open a new terminal.` : `${target} is already on PATH.`,
);

// -- the window

const repo = join(import.meta.dir, "..");
const view = join(repo, "packages", "jeng-gui", "src", "view");
const gui = join(repo, "packages", "jeng-gui");
const channel = `stable-${windows ? "win" : macos ? "macos" : "linux"}-${process.arch}`;

/**
 * Where the window is installed. macOS gets the bundle itself, since an `.app` in
 * ~/Applications is what Launchpad and Spotlight find; elsewhere there is no such thing,
 * so it is a folder of its own beside the executable.
 */
const app = macos
    ? join(homedir(), "Applications", "Jeng.app")
    : join(homedir(), ".jeng", "gui", "Jeng");
const resources = macos ? join(app, "Contents", "Resources") : join(app, "Resources");

const hutch = windows
    ? "& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))"
    : "curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh";

/** What the build left behind, told by what is in the channel folder rather than by its name. */
async function packaged(): Promise<string | undefined> {
    const [bundle] = await readdir(join(repo, "build", channel)).catch(() => []);
    return bundle === undefined ? undefined : join(repo, "build", channel, bundle);
}

/**
 * A Windows build is a self-extracting setup with the app folded into it as a payload,
 * which is what its own metadata sits beside. Anything else that was built is the app.
 */
async function payload(bundle: string): Promise<string | undefined> {
    const carried = join(bundle, "Resources");
    if (!existsSync(join(carried, "metadata.json"))) return undefined;
    const [folded] = (await readdir(carried)).filter((file) => file.endsWith(".tar.zst"));
    return folded === undefined ? undefined : join(carried, folded);
}

/**
 * The window's own files. The view is built here rather than at launch, so the only thing
 * an installed app compiles is a gadget's component, which is decided by the model and
 * cannot be built ahead of time.
 */
async function stageView(into: string): Promise<void> {
    await mkdir(into, { recursive: true });
    for (const file of ["index.html", "theme.css"]) await cp(join(view, file), join(into, file));

    const bundled = await Bun.build({
        entrypoints: [join(view, "index.tsx")],
        format: "esm",
        // The recipe a gadget's component is compiled with, since it is served beside it:
        // minified, and react in the build that checks nothing.
        minify: true,
        define: { "process.env.NODE_ENV": '"production"' },
    });
    if (!bundled.success)
        throw new Error(bundled.logs.map((log) => String(log.message)).join("\n"));

    const code = await bundled.outputs[0].text();
    // A package still named in the bundle is one the build could not find, and the window
    // that loaded it would be blank with the reason in a console nobody opened.
    if (/from "(electrobun|@jeng|react|highlight)[/"]/.test(code))
        throw new Error(
            "the window's bundle still imports a package; run setup from the jeng tree",
        );

    await writeFile(join(into, "view.js"), code);
}

/** The folder a resolved file belongs to, which is the first above it holding a manifest. */
function packageOf(file: string): string {
    let folder = dirname(file);
    while (!existsSync(join(folder, "package.json")) && dirname(folder) !== folder)
        folder = dirname(folder);
    return folder;
}

/**
 * React is copied rather than installed: the versions the tree was built against are the
 * ones a gadget's component has to compile against, and each package is copied with its own
 * dependencies because bun's layout only finds `scheduler` from inside `react-dom`.
 */
async function stageReact(into: string): Promise<void> {
    const queue: [string, string][] = [
        ["react", gui],
        ["react-dom/client", gui],
    ];
    const copied = new Set<string>();
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        const [name, from] = next;
        const folder = packageOf(Bun.resolveSync(name, from));
        if (copied.has(folder)) continue;
        copied.add(folder);
        await cp(folder, join(into, basename(folder)), { recursive: true, dereference: true });
        const manifest = (await Bun.file(join(folder, "package.json")).json()) as {
            dependencies?: Record<string, string>;
        };
        for (const dependency of Object.keys(manifest.dependencies ?? {}))
            queue.push([dependency, folder]);
    }
}

/**
 * The window's icon: the drawing the page asks for, and the rasters the build and the
 * window itself load. Nothing else in here, because the macOS set is only ever read by
 * the build and it has already had it.
 */
async function stageAssets(into: string): Promise<void> {
    await mkdir(into, { recursive: true });
    for (const file of ["jeng.svg", "jeng.ico", "jeng.png"])
        await cp(join(repo, "assets", file), join(into, file));
}

/** The Start menu, which is where Windows looks for an app that was never installed by one. */
async function windowsEntry(launcher: string): Promise<void> {
    const script = [
        "$programs = [Environment]::GetFolderPath('Programs')",
        "$shell = New-Object -ComObject WScript.Shell",
        "$link = $shell.CreateShortcut((Join-Path $programs 'Jeng.lnk'))",
        `$link.TargetPath = '${launcher}'`,
        // The window works in the folder it was launched from, so this is what stops it
        // from starting the agent in the app's own folder.
        `$link.WorkingDirectory = '${homedir()}'`,
        "$link.Description = 'Jeng'",
        "$link.Save()",
    ].join("\n");
    const entry = Bun.spawn(["powershell", "-NoProfile", "-Command", script], {
        stdout: "inherit",
        stderr: "inherit",
    });
    if ((await entry.exited) !== 0) throw new Error("the Start menu entry could not be written");
}

/** The applications menu, which is the same thing on a desktop, for the same reason. */
async function linuxEntry(launcher: string): Promise<void> {
    const folder = join(homedir(), ".local", "share", "applications");
    const file = join(folder, "jeng.desktop");
    await mkdir(folder, { recursive: true });
    await writeFile(
        file,
        [
            "[Desktop Entry]",
            "Type=Application",
            "Name=Jeng",
            `Exec=${launcher}`,
            `Path=${homedir()}`,
            "Terminal=false",
            "Categories=Development;Utility;",
            "",
        ].join("\n"),
    );
    await chmod(file, 0o755);
    // The menu is a cache of the folder, so a stale one is a window that never turns up.
    Bun.spawnSync(["update-desktop-database", folder], { stdout: "ignore", stderr: "ignore" });
}

async function installWindow(): Promise<void> {
    const version = Bun.spawnSync(["hutch", "--version"], { stdout: "ignore", stderr: "ignore" });
    if (version.exitCode !== 0) throw new Error(`it needs Hutch:\n  ${hutch}`);

    const build = Bun.spawn(["bun", "run", "gui:build"], {
        cwd: repo,
        stdout: "inherit",
        stderr: "inherit",
    });
    if ((await build.exited) !== 0) throw new Error("hutch electrobun build did not finish");

    const bundle = await packaged();
    if (bundle === undefined) throw new Error(`nothing was built in build/${channel}`);

    // Replaced rather than copied over, so a file the last build had and this one does not
    // is not left behind for something to find. A window that is open is holding its own
    // files, which is what turns this from a replace into a refusal.
    const staging = `${app}.unpacking`;
    try {
        await rm(app, { recursive: true, force: true });
        await rm(staging, { recursive: true, force: true });
    } catch {
        throw new Error(`${app} is in use: close the window and run setup again`);
    }
    await mkdir(dirname(app), { recursive: true });

    const folded = await payload(bundle);
    if (folded === undefined) {
        await cp(bundle, app, { recursive: true, dereference: true });
    } else {
        // Unpacked under its own name and then renamed onto it, rather than into a folder
        // named after where it is going: the payload carries one of its own.
        await mkdir(staging, { recursive: true });
        await Bun.$`tar -xf ${folded} -C ${staging} --strip-components=1`.quiet();
        await rename(staging, app);
    }

    await stageView(join(resources, "view"));
    await stageReact(join(resources, "node_modules"));
    await stageAssets(join(resources, "assets"));

    if (windows) {
        await windowsEntry(join(app, "bin", "launcher.exe"));
        console.log(`\nThe window installed to ${app} and is in your Start menu.`);
    } else if (macos) {
        console.log(`\nThe window installed to ${app}, which Launchpad and Spotlight both find.`);
    } else {
        await linuxEntry(join(app, "bin", "launcher"));
        console.log(`\nThe window installed to ${app} and is in your applications menu.`);
    }
}

try {
    await installWindow();
} catch (error) {
    // The terminal is the whole of Jeng without it, so a window that would not install is
    // said rather than thrown.
    console.log(
        `\nThe window could not be installed: ${error instanceof Error ? error.message : error}`,
    );
}
