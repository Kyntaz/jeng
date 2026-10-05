const slash = (path: string) => path.replaceAll("\\", "/");

/**
 * How a path is said: relative to the directory it sits in when it is inside one, and in
 * full when it is not. A home two folders down does not need the whole drive spelled out
 * to be found, and one somewhere else has to say where it is.
 *
 * This is a rule about wording rather than about paths, which is why it does not reach
 * for `node:path`. The window is a browser, where anything imported out of `node:` is
 * dropped on the floor by the build that makes it, so a helper reaching for `relative`
 * would work in the terminal and throw in the window. Only the separator has to be
 * handled here: every path being compared came out of the same process, so they agree on
 * their separator and their casing.
 */
export const place = (dir: string, cwd: string): string => {
    if (dir === cwd) return ".";
    const from = slash(cwd).replace(/\/+$/, "");
    const inside = slash(dir);
    return inside.startsWith(`${from}/`) ? inside.slice(from.length + 1) : dir;
};
