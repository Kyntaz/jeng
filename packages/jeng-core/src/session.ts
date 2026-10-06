import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What every session file says about itself, which is all a list of them needs: the name
 * it is loaded by, what it was about, and when it was last touched. Everything else in a
 * file is the conversation's own, which is not this module's business.
 */
export interface Recorded {
    id: string;
    title: string;
    started: string;
    updated: string;
}

export interface SessionRef extends Recorded {
    /** Where it is, so a host that is not sure of the home can still reach it. */
    file: string;
}

const FOLDER = "sessions";

/**
 * A time, spelled so that it sorts the way it happened and is a legal filename on every
 * platform: no colons, which a Windows path cannot carry. The milliseconds are what keep two
 * runs started in the same second off each other's file, and are always three digits so the
 * order still reads as one.
 */
export function sessionId(at: Date = new Date()): string {
    const pad = (value: number, size = 2) => String(value).padStart(size, "0");
    return (
        `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
        `T${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}` +
        `.${pad(at.getMilliseconds(), 3)}`
    );
}

export const sessionsDir = (home: string): string => join(home, FOLDER);

export const sessionFile = (home: string, id: string): string =>
    join(sessionsDir(home), `${id}.json`);

/**
 * Written in one go rather than awaited, because the save worth the most is the one on the
 * way out of the process: an async write loses the session exactly when it was asked for.
 */
export function writeSession<T extends Recorded>(home: string, session: T): string {
    const file = sessionFile(home, session.id);
    mkdirSync(sessionsDir(home), { recursive: true });
    writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`);
    return file;
}

/** A file that is not a session is an error naming it, the same as a `.state` that is not json. */
export function readSession<T extends Recorded>(home: string, id: string): T {
    const file = sessionFile(home, id);
    let text: string;
    try {
        text = readFileSync(file, "utf8");
    } catch {
        throw new Error(`no session ${id} in ${sessionsDir(home)}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error(`${file} is not valid json: ${(error as Error).message}`);
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        throw new Error(`${file} is not a json object`);
    if (
        typeof (parsed as Recorded).id !== "string" ||
        typeof (parsed as Recorded).title !== "string"
    )
        throw new Error(`${file} is not a session`);

    return parsed as T;
}

/**
 * Newest first, which is the order they are read in rather than the order they happened:
 * a list of sessions is looked for the one just before. A file that is not a session is
 * skipped rather than refused, because one that cannot be read is no reason the rest of
 * them are unreachable.
 */
export function listSessions(home: string): SessionRef[] {
    let names: string[];
    try {
        names = readdirSync(sessionsDir(home));
    } catch {
        return [];
    }

    const found: SessionRef[] = [];
    for (const name of names.filter((name) => name.endsWith(".json"))) {
        try {
            const { id, title, started, updated } = readSession<Recorded>(home, name.slice(0, -5));
            found.push({ id, title, started, updated, file: sessionFile(home, id) });
        } catch {}
    }
    return found.sort((one, other) => (one.id < other.id ? 1 : -1));
}
