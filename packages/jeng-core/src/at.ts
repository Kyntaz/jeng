import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

/**
 * Where a written-down path actually is: `~/` is the user's own folder, anything else
 * relative is against the folder it was written in rather than the process's.
 *
 * A bare `~` is refused rather than expanded, because it is the entire home folder and
 * nothing in jeng is a file inside all of it.
 */
export function at(dir: string, written: string): string {
    if (written === "~")
        throw new Error('"~" is your entire home folder. Use "~/.jeng" or a folder inside it.');
    if (written.startsWith("~/")) return resolve(homedir(), written.slice(2));
    return isAbsolute(written) ? written : resolve(dir, written);
}
