import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgent, type AgentEvent } from "../../src";

function fakeModel(scripted: { delta?: Record<string, unknown>; call?: string }[]): { url: string; stop: () => void; requests: () => string[] } {
    const requests: string[] = [];
    let turn = 0;

    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            requests.push(await request.text());
            const step = scripted[turn++] ?? {};
            const delta = step.call
                ? { tool_calls: [{ id: `call_${turn}`, function: { name: "jeng", arguments: step.call } }] }
                : { content: step.delta?.content ?? "" };
            const body = `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`;
            return new Response(body, { headers: { "content-type": "text/event-stream" } });
        },
    });

    return { url: `http://localhost:${server.port}/v1`, stop: () => server.stop(true), requests: () => requests };
}

const GADGET = "/**\n * name: greet\n * description: says hi to someone\n */\n\nexport default async (input: { who: string }) => `hi ${input.who}`\n";

describe("a jeng session", () => {
    test("grows a home folder: commits a protocol, learns from a rejected gadget, then answers", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const cwd = await mkdtemp(join(tmpdir(), "jeng-cwd-"));
        await Bun.write(join(cwd, "AGENTS.md"), "answer in one line\n");

        const model = fakeModel([
            { call: JSON.stringify({ action: "create_protocol", name: "greeting", when: "meeting someone", description: "how to greet", content: "use the greet gadget" }) },
            { call: JSON.stringify({ action: "create_gadget", name: "greet", source: "/**\n * name: greet\n * description: says hi\n */\n\nexport default () => {\n" }) },
            { call: JSON.stringify({ action: "create_gadget", name: "greet", source: GADGET }) },
            { call: JSON.stringify({ action: "run_gadget", name: "greet", input: { who: "world" } }) },
            { delta: { content: "hi world" } },
        ]);

        const agent = await createAgent({
            cwd,
            homes: [home],
            config: { baseUrl: model.url, apiKey: undefined, model: "fake" },
        });

        const events: AgentEvent[] = [];
        const reply = await agent.send("say hi to the world", { onEvent: (event) => events.push(event) });

        expect(reply).toBe("hi world");
        expect(agent.homes[0].protocols.map((protocol) => protocol.name)).toEqual(["greeting"]);
        expect(agent.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        expect(events.filter((event) => event.type === "result" && event.ok === false)).toHaveLength(1);

        const requests = model.requests();
        expect(requests[0]).toContain("answer in one line");
        expect(requests[2]).toContain("gadget does not compile");
        expect(requests[4]).toContain("hi world");

        model.stop();
        await rm(home, { recursive: true, force: true });
        await rm(cwd, { recursive: true, force: true });
    });

    test("pulls a protocol into context only once the model asks for it", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        await Bun.write(join(home, "protocols", "deploy.md"), "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make, then push\n");

        const model = fakeModel([
            { call: JSON.stringify({ action: "load_protocol", name: "deploy" }) },
            { delta: { content: "ship it" } },
        ]);

        const agent = await createAgent({ cwd: home, homes: [home], config: { baseUrl: model.url, apiKey: undefined, model: "fake" } });
        await agent.send("how do we deploy?");

        const requests = model.requests();
        expect(requests[0]).not.toContain("run make, then push");
        expect(requests[1]).toContain("run make, then push");
        expect(agent.memory.map((item) => item.name)).toEqual(["deploy"]);

        model.stop();
        await rm(home, { recursive: true, force: true });
    });
});