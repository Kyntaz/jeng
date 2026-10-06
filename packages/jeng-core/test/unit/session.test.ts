import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    listSessions,
    type Recorded,
    readSession,
    sessionId,
    sessionsDir,
    writeSession,
} from "../../src/session";

async function home(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
    const dir = await mkdtemp(join(tmpdir(), "jeng-session-"));
    return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const recorded = (id: string, title: string): Recorded => ({
    id,
    title,
    started: "2026-10-06T14:02:11.204Z",
    updated: "2026-10-06T14:19:02.881Z",
});

const MORNING = "2026-10-06T09-02-11";
const AFTERNOON = "2026-10-06T14-19-02";

describe("a session", () => {
    test("keeps them in a sessions folder inside the home it belongs to", async () => {
        const { dir, cleanup } = await home();

        expect(sessionsDir(dir)).toBe(join(dir, "sessions"));
        await cleanup();
    });

    test("is named by when it happened, so a list of them is already in order", () => {
        const earlier = sessionId(new Date(2026, 9, 6, 9, 2, 11, 5));
        const later = sessionId(new Date(2026, 9, 6, 14, 19, 2, 500));

        expect({ earlier, later, inOrder: earlier < later }).toEqual({
            earlier: "2026-10-06T09-02-11.005",
            later: "2026-10-06T14-19-02.500",
            inOrder: true,
        });
    });

    test("carries no colon, which a path on windows cannot have", () => {
        expect(sessionId()).not.toContain(":");
    });

    test("hands back what was written to it", async () => {
        const { dir, cleanup } = await home();

        writeSession(dir, { ...recorded(MORNING, "what files are in src?"), history: [] });

        expect(readSession(dir, MORNING)).toMatchObject({
            title: "what files are in src?",
            history: [],
        });
        await cleanup();
    });

    test("creates the folder it is written to rather than losing the session", async () => {
        const { dir, cleanup } = await home();
        const fresh = join(dir, "fresh");

        writeSession(fresh, recorded(MORNING, "hello"));

        expect(await Bun.file(sessionFile(fresh, MORNING)).exists()).toBe(true);
        await cleanup();
    });

    test("says which session is missing rather than starting an empty one", async () => {
        const { dir, cleanup } = await home();

        expect(() => readSession(dir, MORNING)).toThrow(
            `no session ${MORNING} in ${sessionsDir(dir)}`,
        );
        await cleanup();
    });

    test("names the file it cannot read rather than reading it as empty", async () => {
        const { dir, cleanup } = await home();
        await Bun.write(sessionFile(dir, MORNING), "not json at all");

        expect(() => readSession(dir, MORNING)).toThrow(sessionFile(dir, MORNING));
        await cleanup();
    });

    test("lists them newest first, which is the order they are looked for in", async () => {
        const { dir, cleanup } = await home();
        writeSession(dir, recorded(MORNING, "morning"));
        writeSession(dir, recorded(AFTERNOON, "afternoon"));
        writeSession(dir, recorded("2026-10-05T18-00-00", "yesterday"));

        expect(listSessions(dir).map((session) => session.title)).toEqual([
            "afternoon",
            "morning",
            "yesterday",
        ]);
        await cleanup();
    });

    test("lists nothing at all for a home that has never had one", async () => {
        const { dir, cleanup } = await home();

        expect(listSessions(dir)).toEqual([]);
        await cleanup();
    });

    test("leaves out a file that is not a session rather than losing the rest", async () => {
        const { dir, cleanup } = await home();
        writeSession(dir, recorded(AFTERNOON, "afternoon"));
        await Bun.write(sessionFile(dir, MORNING), "not json at all");

        expect(listSessions(dir).map((session) => session.title)).toEqual(["afternoon"]);
        await cleanup();
    });

    test("ignores anything in the folder that is not named after a session", async () => {
        const { dir, cleanup } = await home();
        writeSession(dir, recorded(AFTERNOON, "afternoon"));
        await Bun.write(join(sessionsDir(dir), "notes.txt"), "half an idea");

        expect(listSessions(dir)).toHaveLength(1);
        await cleanup();
    });
});

const sessionFile = (home: string, id: string) => join(sessionsDir(home), `${id}.json`);
