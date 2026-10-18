import { dlopen, FFIType } from "bun:ffi";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrowserWindow } from "electrobun/main";
import { assets } from "./paths";

type Pointer = NonNullable<BrowserWindow["ptr"]>;

/** The raster cut from the drawing that a window on this platform can load. */
const raster = join(assets, process.platform === "win32" ? "jeng.ico" : "jeng.png");

/**
 * The icon the window is identified by. Nothing sets one, so a window is identified by
 * whatever executable happens to be hosting it — bun, in a run from source. Windows is
 * given one through its own window message; the library Electrobun loads beside itself
 * has a call for the other two, which does nothing on Windows and is why the message is
 * here. A window that cannot be given an icon is still a window.
 */
export function setIcon(window: BrowserWindow): void {
    const pointer = window.ptr;
    if (pointer === null) return;

    try {
        if (process.platform === "win32") windows(pointer);
        else electrobun(pointer);
    } catch {
        // left with the icon of whatever is hosting it
    }
}

const WM_SETICON = 0x80;
const LR_LOADFROMFILE = 0x10;

/** The icon a window is identified by in full, and the one beside its title. */
const sizes = [
    [1, 32], // ICON_BIG
    [0, 16], // ICON_SMALL
];

function windows(pointer: Pointer): void {
    const { symbols } = dlopen("user32.dll", {
        LoadImageW: {
            args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
            returns: FFIType.ptr,
        },
        SendMessageW: {
            args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr],
            returns: FFIType.ptr,
        },
    });

    const name = Buffer.from(`${raster}\0`, "utf16le");
    for (const [which, size] of sizes)
        symbols.SendMessageW(
            pointer,
            WM_SETICON,
            which,
            symbols.LoadImageW(0, name, 1, size, size, LR_LOADFROMFILE),
        );
}

/**
 * Electrobun's own call for it, in the windowing library it loads from beside the
 * executable hosting the window rather than out of anything the app installed.
 */
function electrobun(pointer: Pointer): void {
    const suffixes = { darwin: "dylib", linux: "so" };
    const name = `libNativeWrapper.${suffixes[process.platform as keyof typeof suffixes] ?? "so"}`;
    const home = [process.cwd(), dirname(process.argv0)].find((dir) => existsSync(join(dir, name)));
    if (home === undefined) return;

    dlopen(join(home, name), {
        setWindowIcon: { args: [FFIType.ptr, FFIType.cstring], returns: FFIType.void },
    }).symbols.setWindowIcon(pointer, raster);
}
