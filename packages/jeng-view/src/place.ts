const slash = (path: string) => path.replaceAll("\\", "/");

/**
 * How a path is said: relative to the directory it sits in when it is inside one, and in
 * full when it is not. A home two folders down does not need the whole drive spelled out
 * to be found, and one somewhere else has to say where it is.
 *
 * Only wording, never `node:path`: the window is a browser, and every path compared here
 * came out of the process doing the comparing, so the separators already agree.
 */
export const place = (dir: string, cwd: string): string => {
    if (dir === cwd) return ".";
    const from = slash(cwd).replace(/\/+$/, "");
    const inside = slash(dir);
    return inside.startsWith(`${from}/`) ? inside.slice(from.length + 1) : dir;
};
