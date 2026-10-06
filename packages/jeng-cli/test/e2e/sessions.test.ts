import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { listSessions, readSession } from "@jeng/core";
import type { Session } from "@jeng/view";

/** A model that ends its turn, and a record of everything it was asked. */
function fakeModel(scripted: Step[]) {
    const requests: string[] = [];
    let turn = 0;
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            requests.push(await request.text());
            const step = scripted[turn++] ?? {};
            const delta = step.call
                ? {
                      tool_calls: [
                          { id: `call_${turn}`, function: { name: "jeng", arguments: step.call } },
                      ],
                  }
                : { content: step.delta ?? "" };
            return new Response(
                [`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`, "data: [DONE]\n\n"].join(
                    "",
                ),
                { headers: { "content-type": "text/event-stream" } },
            );
        },
    });
    return {
        url: `http://localhost:${server.port}/v1`,
        requests: () => requests,
        stop: () => server.stop(true),
    };
}

interface Step {
    delta?: string;
    call?: string;
}

const end = (content: string): Step => ({ call: JSON.stringify({ action: "end", content }) });

/**
 * A config file outranks the environment, so a test that ran jeng from this repo would
 * answer from whatever model the repo's own jeng.json names. Every run gets a home and a
 * config of its own instead, which is the only way a fake model here is the model that
 * gets used.
 */
async function cli(home: string, model: string, args: string[]) {
    await Bun.write(
        join(home, "jeng.json"),
        JSON.stringify({ homes: [home], model: { baseUrl: model, model: "fake" } }),
    );
    return Bun.spawn(["bun", "run", resolve("packages/jeng-cli/src/index.ts"), ...args], {
        cwd: home,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
    });
}

/**
 * A run with a prompt on the argument, which is the shape that writes a session down. No
 * `--home`: the home is the directory the run is in and the config beside it, so the flag
 * would be a second answer to a question already answered.
 */
const run = (home: string, model: string, prompt: string, args: string[] = []) =>
    cli(home, model, [prompt, ...args]);

const only = async (home: string): Promise<Session> => {
    const [session] = listSessions(home);
    if (!session) throw new Error("nothing was written down");
    return readSession<Session>(home, session.id);
};

describe("jeng --session", () => {
    test("writes a run down in the first home, so it can be picked back up", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("noted")]);

        const proc = await run(home, model.url, "remember the milk is oat");
        await proc.exited;

        expect((await only(home)).title).toBe("remember the milk is oat");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("keeps the whole conversation in it, so the model is told what came before", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("noted"), end("oat")]);

        await (await run(home, model.url, "remember the milk is oat")).exited;
        const session = await only(home);
        await (await run(home, model.url, "what is the milk?", ["--session", session.id])).exited;

        expect(model.requests()[1]).toContain("remember the milk is oat");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("keeps them in a sessions folder in the home, named by when they happened", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("noted")]);

        await (await run(home, model.url, "say hi")).exited;

        expect(await readdir(join(home, "sessions"))).toHaveLength(1);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("lists them newest first, which is the order they are looked for in", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("noted"), end("noted again")]);

        await (await run(home, model.url, "the first thing")).exited;
        const first = await only(home);
        await (await run(home, model.url, "the second thing")).exited;

        const proc = await cli(home, model.url, ["--sessions"]);
        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({
            code,
            listed: stdout.includes("the second thing"),
            older: stdout.indexOf(first.id) > stdout.indexOf("the second thing"),
        }).toEqual({ code: 0, listed: true, older: true });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("says so when a home has no sessions to list", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([]);

        const proc = await cli(home, model.url, ["--home", home, "--sessions"]);
        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, listed: stdout.trim() }).toEqual({ code: 0, listed: "no sessions yet" });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("says which session is not there rather than starting a new one silently", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("never reached")]);

        const proc = await run(home, model.url, "say hi", ["--session", "2026-10-06T14-02-11"]);
        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect({ code, message: stderr.trim() }).toEqual({
            code: 1,
            message: `no session 2026-10-06T14-02-11 in ${join(home, "sessions")}`,
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("refuses a session asked for with a flag that names a different run", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("noted")]);

        await (await run(home, model.url, "remember the milk is oat")).exited;
        const session = await only(home);
        const proc = await run(home, model.url, "what is the milk?", [
            "--session",
            session.id,
            "--mode",
            "work",
        ]);
        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect(code).toBe(1);
        expect(stderr).toContain("a session carries its own config, homes and mode");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("refuses to list and open at once, which are two answers to one question", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([]);

        const proc = await cli(home, model.url, ["--home", home, "--sessions", "--session", "x"]);
        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect({ code, message: stderr.trim() }).toEqual({
            code: 1,
            message: "--sessions lists them and --session opens one: pick one",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("keeps what it read back in the same session rather than starting a new one", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("noted"), end("oat")]);

        await (await run(home, model.url, "remember the milk is oat")).exited;
        const session = await only(home);
        await (await run(home, model.url, "what is the milk?", ["--session", session.id])).exited;

        const said = (await only(home)).history.flatMap((message) =>
            message.role === "user" ? [message.content] : [],
        );
        expect(said).toEqual(["remember the milk is oat", "what is the milk?"]);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("keeps a one-shot's memory of the exchange, which is all a printed run had", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("noted")]);

        await (await run(home, model.url, "remember the milk is oat")).exited;

        expect(await only(home)).toMatchObject({
            title: "remember the milk is oat",
            entries: [],
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });
});
