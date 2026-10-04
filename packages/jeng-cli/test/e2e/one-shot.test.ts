import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function fakeModel(scripted: Step[], reasoning = ""): { url: string; stop: () => void } {
    let turn = 0;
    const server = Bun.serve({
        port: 0,
        fetch() {
            const step = scripted[turn++] ?? {};
            const thoughts = reasoning
                ? `data: ${JSON.stringify({ choices: [{ delta: { reasoning } }] })}\n\n`
                : "";
            const delta = step.call
                ? {
                      tool_calls: [
                          { id: `call_${turn}`, function: { name: "jeng", arguments: step.call } },
                      ],
                  }
                : { content: step.delta ?? "" };
            return new Response(
                [
                    thoughts,
                    `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`,
                    "data: [DONE]\n\n",
                ].join(""),
                { headers: { "content-type": "text/event-stream" } },
            );
        },
    });
    return { url: `http://localhost:${server.port}/v1`, stop: () => server.stop(true) };
}

// A model that ends its turn by handing back exactly the prompt it was given,
// so a test can assert what the user actually wrote reached it.
function echoModel(): { url: string; stop: () => void } {
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            const body = (await request.json()) as { messages: { content: string }[] };
            const step = {
                call: JSON.stringify({
                    action: "end",
                    content: body.messages.at(-1)?.content ?? "",
                }),
            };
            return new Response(
                [
                    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: "call_1", function: { name: "jeng", arguments: step.call } }] } }] })}\n\n`,
                    "data: [DONE]\n\n",
                ].join(""),
                { headers: { "content-type": "text/event-stream" } },
            );
        },
    });
    return { url: `http://localhost:${server.port}/v1`, stop: () => server.stop(true) };
}

// A config file outranks the environment, so a test that ran jeng from this repo
// would answer from whatever model the repo's own jeng.json names. Every run gets
// a home and a config of its own instead, which is the only way a fake model here
// is the model that gets used.
async function cli(home: string, model: string, args: string[], prompt?: string) {
    await Bun.write(
        join(home, "jeng.json"),
        JSON.stringify({ homes: [home], model: { baseUrl: model, model: "fake" } }),
    );

    return Bun.spawn(["bun", "run", resolve("packages/jeng-cli/src/index.ts"), ...args], {
        cwd: home,
        // The config settles the model on its own, so no ambient variable can reach
        // the run and nothing about the spawn has to be restated here.
        env: process.env,
        ...(prompt === undefined ? {} : { stdin: new Blob([prompt]) }),
        stdout: "pipe",
        stderr: "pipe",
    });
}

function runPiped(home: string, prompt: string, model: string, args: string[] = []) {
    return cli(home, model, ["--home", home, ...args], prompt);
}

interface Step {
    delta?: string;
    call?: string;
}

const end = (content: string) => ({ call: JSON.stringify({ action: "end", content }) });

// A model that tries to build a gadget and then answers, so a test can see
// whether the home grew.
function buildingModel(): { url: string; stop: () => void } {
    const source =
        "/**\n * name: shout\n * description: upper cases the text\n */\n\nexport default async (input: { text: string }) => input.text.toUpperCase()\n";
    return fakeModel([
        {
            call: JSON.stringify({
                action: "create_gadget",
                name: "shout",
                reason: "to shout what you tell me",
                source,
            }),
        },
        end("built it"),
    ]);
}

const gadget = (home: string) => join(home, "gadgets", "shout.ts");

function run(home: string, prompt: string, model: string, args: string[] = []) {
    return cli(home, model, [prompt, "--home", home, ...args]);
}

describe("jeng", () => {
    test("runs a single prompt and prints the answer", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("hello from the fake model")]);

        const proc = await run(home, "say hi", model.url);

        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({
            code: 0,
            answer: "hello from the fake model",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("keeps talking and only prints the answer the model ends with", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([{ delta: "let me check" }, { delta: "one moment" }, end("4")]);

        const proc = await run(home, "what is 2+2?", model.url);

        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({
            code: 0,
            answer: "let me checkone moment\n4",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("prints the answer when the model only thought and then ended", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("4")], "two plus two is four");

        const proc = await run(home, "what is 2+2?", model.url);

        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({ code: 0, answer: "4" });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("takes its whole configuration from the json file it is pointed at", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("configured through a file")]);
        const config = join(home, "jeng.json");
        await Bun.write(
            config,
            JSON.stringify({ homes: [home], model: { baseUrl: model.url, model: "fake" } }),
        );

        const proc = Bun.spawn(
            ["bun", "run", resolve("packages/jeng-cli/src/index.ts"), "say hi", "-c", config],
            {
                cwd: resolve("."),
                env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" },
                stdout: "pipe",
                stderr: "pipe",
            },
        );

        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({
            code: 0,
            answer: "configured through a file",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("fails loudly when the json file it is pointed at is not there", async () => {
        const proc = Bun.spawn(
            [
                "bun",
                "run",
                resolve("packages/jeng-cli/src/index.ts"),
                "say hi",
                "-c",
                "missing.json",
            ],
            {
                cwd: resolve("."),
                stdout: "pipe",
                stderr: "pipe",
            },
        );

        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect({ code, message: stderr.trim() }).toEqual({
            code: 1,
            message: "config file not found: missing.json",
        });
    });

    test("takes a prompt piped in on stdin", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = echoModel();

        const proc = await runPiped(home, "say hi\nfrom a pipe\n", model.url);

        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({
            code: 0,
            answer: "say hi\nfrom a pipe",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("refuses to start when stdin is piped in but empty", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = echoModel();

        const proc = await runPiped(home, "\n", model.url);

        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect({ code, message: stderr.trim() }).toEqual({
            code: 1,
            message: "no prompt given, on the argument or on stdin",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("prints what --help says it can do", async () => {
        const proc = Bun.spawn(
            ["bun", "run", resolve("packages/jeng-cli/src/index.ts"), "--help"],
            { stdout: "pipe", stderr: "pipe" },
        );
        const help = await new Response(proc.stdout).text();

        expect(help).toContain("--home");
        expect(help).toContain("-c, --config");
        expect(help).toContain("-y, --yes");
        expect(help).toContain("--mode");
        expect(help).toContain("run a single prompt and exit");
    });

    test("runs a --mode work prompt without telling it how to grow", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("4")]);
        const proc = await run(home, "what is 2+2?", model.url, ["--mode", "work"]);
        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({ code: 0, answer: "4" });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("writes no gadget for a --mode work run that asks for one", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = buildingModel();

        const proc = await run(home, "make me a gadget that shouts\n", model.url, [
            "--mode",
            "work",
            "--yes",
        ]);

        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect(code).toBe(0);
        expect(stderr).toContain("learn-mode action");
        expect(await Bun.file(gadget(home)).exists()).toBe(false);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("refuses a --mode that is not one of the two it has", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("never reached")]);

        const proc = await run(home, "say hi", model.url, ["--mode", "explore"]);

        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect({ code, message: stderr.trim() }).toEqual({
            code: 1,
            message: "mode must be learn or work, not explore",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("writes no gadget when a piped run has nobody to approve it", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = buildingModel();

        const proc = await runPiped(home, "make me a gadget that shouts\n", model.url);

        const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

        expect(code).toBe(0);
        expect(stderr).toContain("there is no terminal to approve on");
        expect(await Bun.file(gadget(home)).exists()).toBe(false);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("writes the gadget when --yes says to stop asking", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = buildingModel();

        const proc = await runPiped(home, "make me a gadget that shouts\n", model.url, ["--yes"]);

        const [code] = await Promise.all([proc.exited]);

        expect(code).toBe(0);
        expect(await Bun.file(gadget(home)).exists()).toBe(true);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });
});
