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

interface Step {
    delta?: string;
    call?: string;
}

const end = (content: string) => ({ call: JSON.stringify({ action: "end", content }) });

function run(home: string, prompt: string, model: string, args: string[] = []) {
    return Bun.spawn(
        ["bun", "run", resolve("packages/jeng-cli/src/index.ts"), prompt, "--home", home, ...args],
        {
            cwd: resolve("."),
            env: {
                ...process.env,
                JENG_BASE_URL: model,
                JENG_MODEL: "fake",
                JENG_API_KEY: "",
            },
            stdout: "pipe",
            stderr: "pipe",
        },
    );
}

describe("jeng", () => {
    test("runs a single prompt and prints the answer", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel([end("hello from the fake model")]);

        const proc = run(home, "say hi", model.url);

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

        const proc = run(home, "what is 2+2?", model.url);

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

        const proc = run(home, "what is 2+2?", model.url);

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

    test("prints what --help says it can do", async () => {
        const proc = Bun.spawn(
            ["bun", "run", resolve("packages/jeng-cli/src/index.ts"), "--help"],
            { stdout: "pipe", stderr: "pipe" },
        );
        const help = await new Response(proc.stdout).text();

        expect(help).toContain("--home");
        expect(help).toContain("-c, --config");
        expect(help).toContain("run a single prompt and exit");
    });
});
