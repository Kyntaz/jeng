import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function fakeModel(chunks: string[]): { url: string; stop: () => void } {
    const server = Bun.serve({
        port: 0,
        fetch() {
            const frames = chunks.map(
                (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
            );
            return new Response([...frames, "data: [DONE]\n\n"].join(""), {
                headers: { "content-type": "text/event-stream" },
            });
        },
    });
    return { url: `http://localhost:${server.port}/v1`, stop: () => server.stop(true) };
}

describe("jeng", () => {
    test("runs a single prompt and prints the answer", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel(["hello ", "from the fake model"]);

        const proc = Bun.spawn(
            ["bun", "run", resolve("packages/jeng-cli/src/index.ts"), "say hi", "--home", home],
            {
                cwd: resolve("."),
                env: {
                    ...process.env,
                    JENG_BASE_URL: model.url,
                    JENG_MODEL: "fake",
                    JENG_API_KEY: "",
                },
                stdout: "pipe",
                stderr: "pipe",
            },
        );

        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({
            code: 0,
            answer: "hello from the fake model",
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("takes its whole configuration from the json file it is pointed at", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel(["configured ", "through a file"]);
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
