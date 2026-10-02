import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, createAgent } from "../../src";

function fakeModel(scripted: { delta?: Record<string, unknown>; call?: string }[]): {
    url: string;
    stop: () => void;
    requests: () => string[];
} {
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
                : { content: step.delta?.content ?? "" };
            const body = `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`;
            return new Response(body, { headers: { "content-type": "text/event-stream" } });
        },
    });

    return {
        url: `http://localhost:${server.port}/v1`,
        stop: () => server.stop(true),
        requests: () => requests,
    };
}

const GADGET =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: gadget source, not a template
    "/**\n * name: greet\n * description: says hi to someone\n */\n\nexport default async (input: { who: string }) => `hi ${input.who}`\n";

describe("a jeng session", () => {
    test("grows a home folder: commits a protocol, learns from a rejected gadget, then answers", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const cwd = await mkdtemp(join(tmpdir(), "jeng-cwd-"));
        await Bun.write(join(cwd, "AGENTS.md"), "answer in one line\n");

        const model = fakeModel([
            {
                call: JSON.stringify({
                    action: "create_protocol",
                    name: "greeting",
                    when: "meeting someone",
                    description: "how to greet",
                    content: "use the greet gadget",
                }),
            },
            {
                call: JSON.stringify({
                    action: "create_gadget",
                    name: "greet",
                    source: "/**\n * name: greet\n * description: says hi\n */\n\nexport default () => {\n",
                }),
            },
            { call: JSON.stringify({ action: "create_gadget", name: "greet", source: GADGET }) },
            {
                call: JSON.stringify({
                    action: "run_gadget",
                    name: "greet",
                    input: { who: "world" },
                }),
            },
            { delta: { content: "hi world" } },
        ]);

        const agent = await createAgent({
            cwd,
            homes: [home],
            config: { baseUrl: model.url, apiKey: undefined, model: "fake" },
        });

        const events: AgentEvent[] = [];
        const reply = await agent.send("say hi to the world", {
            onEvent: (event) => events.push(event),
        });

        expect(reply).toBe("hi world");
        expect(agent.homes[0].protocols.map((protocol) => protocol.name)).toEqual(["greeting"]);
        expect(agent.homes[0].gadgets.map((gadget) => gadget.name)).toEqual(["greet"]);
        expect(
            events.filter((event) => event.type === "result" && event.ok === false),
        ).toHaveLength(1);

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
        await Bun.write(
            join(home, "protocols", "deploy.md"),
            "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make, then push\n",
        );

        const model = fakeModel([
            { call: JSON.stringify({ action: "load_protocol", name: "deploy" }) },
            { delta: { content: "ship it" } },
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: { baseUrl: model.url, apiKey: undefined, model: "fake" },
        });
        await agent.send("how do we deploy?");

        const requests = model.requests();
        expect(requests[0]).not.toContain("run make, then push");
        expect(requests[1]).toContain("run make, then push");
        expect(agent.memory.map((item) => item.name)).toEqual(["deploy"]);

        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("stops instead of repeating a call that just gave the same result", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const call = JSON.stringify({ action: "load_protocol", name: "missing" });
        const model = fakeModel([{ call }, { call }, { call }, { call }]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: { baseUrl: model.url, apiKey: undefined, model: "fake" },
        });
        const reply = await agent.send("deploy the thing");

        expect(reply).toContain('"load_protocol" was called twice in a row');
        expect(model.requests()).toHaveLength(2);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("lets the model retry a call after something else changed its context", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const run = JSON.stringify({ action: "run_gadget", name: "count" });
        const model = fakeModel([
            { call: run },
            { call: JSON.stringify({ action: "load_protocol", name: "greet" }) },
            { call: run },
            { delta: { content: "done" } },
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: { baseUrl: model.url, apiKey: undefined, model: "fake" },
        });

        expect(await agent.send("count the lines")).toBe("done");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("keeps every tool call paired with its result in the history it replays", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        await Bun.write(
            join(home, "protocols", "deploy.md"),
            "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make\n",
        );

        const model = fakeModel([
            { call: JSON.stringify({ action: "load_protocol", name: "deploy" }) },
            { delta: { content: "ship it" } },
            { delta: { content: "and again" } },
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: { baseUrl: model.url, apiKey: undefined, model: "fake" },
        });
        await agent.send("how do we deploy?");
        await agent.send("say it again");

        const second = JSON.parse(model.requests()[2]).messages;
        const orphan = second.findIndex(
            (message: { role: string; tool_calls?: unknown[] }) =>
                message.role === "assistant" && message.tool_calls !== undefined,
        );
        expect(second[orphan + 1].role).toBe("tool");
        expect(second[orphan + 1].tool_call_id).toBe("call_1");

        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("clear forgets the conversation and the loaded protocols", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        await Bun.write(
            join(home, "protocols", "deploy.md"),
            "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make\n",
        );

        const model = fakeModel([
            { call: JSON.stringify({ action: "load_protocol", name: "deploy" }) },
            { delta: { content: "ship it" } },
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: { baseUrl: model.url, apiKey: undefined, model: "fake" },
        });
        await agent.send("how do we deploy?");
        agent.clear();

        expect({ history: agent.history.length, memory: agent.memory.length }).toEqual({
            history: 0,
            memory: 0,
        });
        model.stop();
        await rm(home, { recursive: true, force: true });
    });
});
