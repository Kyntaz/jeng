import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function fakeModel(chunks: string[]): { url: string; stop: () => void } {
    const server = Bun.serve({
        port: 0,
        fetch() {
            const stream = chunks.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join("") + "data: [DONE]\n\n";
            return new Response(stream, { headers: { "content-type": "text/event-stream" } });
        },
    });
    return { url: `http://localhost:${server.port}/v1`, stop: () => server.stop(true) };
}

describe("jeng", () => {
    test("runs a single prompt and prints the answer", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-cli-"));
        const model = fakeModel(["hello ", "from the fake model"]);

        const proc = Bun.spawn(["bun", "run", resolve("packages/jeng-cli/src/index.ts"), "say hi", "--home", home], {
            cwd: resolve("."),
            env: { ...process.env, JENG_BASE_URL: model.url, JENG_MODEL: "fake", JENG_API_KEY: "" },
            stdout: "pipe",
            stderr: "pipe",
        });

        const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

        expect({ code, answer: stdout.trim() }).toEqual({ code: 0, answer: "hello from the fake model" });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("prints what --help says it can do", async () => {
        const proc = Bun.spawn(["bun", "run", resolve("packages/jeng-cli/src/index.ts"), "--help"], { stdout: "pipe", stderr: "pipe" });
        const help = await new Response(proc.stdout).text();

        expect(help).toContain("--home");
        expect(help).toContain("run a single prompt and exit");
    });
});