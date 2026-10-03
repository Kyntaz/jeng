import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, type Approve, createAgent } from "../../src";

function fakeModel(scripted: Step[]): {
    url: string;
    stop: () => void;
    requests: () => string[];
    arrived: (n: number) => Promise<void>;
} {
    const requests: string[] = [];
    let turn = 0;

    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            requests.push(await request.text());
            const step = scripted[turn++] ?? {};
            if (step.delay) await Bun.sleep(step.delay);
            const delta = step.call
                ? {
                      tool_calls: [
                          { id: `call_${turn}`, function: { name: "jeng", arguments: step.call } },
                      ],
                  }
                : { content: step.delta?.content ?? "" };
            const usage = step.tokens ? { usage: { prompt_tokens: step.tokens } } : {};
            const frames = [
                `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`,
                step.tokens ? `data: ${JSON.stringify(usage)}\n\n` : "",
                "data: [DONE]\n\n",
            ];
            return new Response(frames.join(""), {
                headers: { "content-type": "text/event-stream" },
            });
        },
    });

    const arrived = async (n: number) => {
        while (requests.length < n) await Bun.sleep(1);
    };

    return {
        url: `http://localhost:${server.port}/v1`,
        stop: () => server.stop(true),
        requests: () => requests,
        arrived,
    };
}

interface Step {
    delta?: Record<string, unknown>;
    call?: string;
    delay?: number;
    tokens?: number;
}

const end = (content: string) => ({ call: JSON.stringify({ action: "end", content }) });
const act = (args: Record<string, unknown>) => ({ call: JSON.stringify(args) });

const CONFIG = (url: string) => ({
    baseUrl: url,
    apiKey: undefined,
    model: "fake",
    contextWindow: 8192,
});

// Most of these sessions never write anything, so the approver only has to be
// present rather than interesting.
const allow: Approve = async () => ({ approved: true });

const GADGET =
    // biome-ignore lint/suspicious/noTemplateCurlyInString: gadget source, not a template
    "/**\n * name: greet\n * description: says hi to someone\n */\n\nexport default async (input: { who: string }) => `hi ${input.who}`\n";

const UI_GADGET =
    '/**\n * name: pick\n * ui: true\n * description: asks which branch\n */\n\nexport default async (_input: unknown, ui) => {\n    const answers = await ui({ kind: "select", name: "branch", question: "which?", options: [] })\n    return "on " + (answers.branch ?? "nothing")\n}\n';

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
                    reason: "so i can say hi for you",
                    source: "/**\n * name: greet\n * description: says hi\n */\n\nexport default () => {\n",
                }),
            },
            {
                call: JSON.stringify({
                    action: "create_gadget",
                    name: "greet",
                    reason: "so i can say hi for you",
                    source: GADGET,
                }),
            },
            {
                call: JSON.stringify({
                    action: "run_gadget",
                    name: "greet",
                    input: { who: "world" },
                }),
            },
            end("hi world"),
        ]);

        const agent = await createAgent({
            cwd,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
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

    test("hands the user's reason for a refusal back to the model so it can try again", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const dangerous =
            "/**\n * name: wipe\n * description: empties the home\n */\n\nexport default async () => await Bun.$`rm -rf *`.quiet()\n";
        const safe =
            "/**\n * name: wipe\n * description: counts the files\n */\n\nexport default async () => 'nothing was deleted'\n";

        const model = fakeModel([
            act({ action: "create_gadget", name: "wipe", reason: "to tidy up", source: dangerous }),
            act({ action: "create_gadget", name: "wipe", reason: "to count files", source: safe }),
            end("counted instead of deleting"),
        ]);

        const asked: string[] = [];
        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: async (request) => {
                asked.push(request.source);
                return asked.length === 1
                    ? { approved: false, reason: "it deletes files" }
                    : { approved: true };
            },
        });

        expect(await agent.send("tidy up the folder")).toBe("counted instead of deleting");

        const requests = model.requests();
        expect(asked).toEqual([dangerous, safe]);
        expect(requests[1]).toContain("it deletes files");
        expect(await Bun.file(join(home, "gadgets", "wipe.ts")).text()).toBe(safe);

        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("pulls a protocol into context only once the model asks for it", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        await Bun.write(
            join(home, "protocols", "deploy.md"),
            "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make, then push\n",
        );

        const model = fakeModel([
            { call: JSON.stringify({ action: "load_protocol", name: "deploy" }) },
            end("ship it"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
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
            config: CONFIG(model.url),
            approve: allow,
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
            end("done"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
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
            end("ship it"),
            end("and again"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
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
            end("ship it"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
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

    test("does not hand control back when the model only talks", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([
            { delta: { content: "let me look that up" } },
            { delta: { content: "one moment" } },
            end("4"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });

        expect(await agent.send("what is 2+2?")).toBe("4");
        expect(model.requests()).toHaveLength(3);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("nudges the model back to work when it talks instead of calling end", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([{ delta: { content: "hmm" } }, end("4")]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        await agent.send("what is 2+2?");

        expect(model.requests()[1]).toContain("with that answer now");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("compacts the transcript down to the model's own summary", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([
            act({ action: "compact", summary: "we were counting lines in src" }),
            end("12 lines"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        await agent.send("count the lines in src, and keep going");

        expect(agent.history.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
        expect(agent.history[0].content).toBe(
            "[earlier conversation, compacted]\n\nwe were counting lines in src",
        );
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("keeps loaded protocols across a compact, since memory is not the transcript", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        await Bun.write(
            join(home, "protocols", "deploy.md"),
            "---\nname: deploy\ndescription: how we ship\nwhen: deploying\n---\n\nrun make\n",
        );
        const model = fakeModel([
            act({ action: "load_protocol", name: "deploy" }),
            act({ action: "compact", summary: "we were deploying" }),
            end("ship it"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        await agent.send("deploy it");

        expect(agent.memory.map((item) => item.name)).toEqual(["deploy"]);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("tells the model how full its context is", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([
            { ...act({ action: "load_protocol", name: "deploy" }), tokens: 1200 },
            end("done"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        await agent.send("deploy it");

        expect(model.requests()[1]).toContain("Context: 1200/8192 tokens.");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("delivers an injected message between two of the model's own calls", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([
            { ...act({ action: "load_protocol", name: "deploy" }), delay: 20 },
            end("ship it"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        const sending = agent.send("how do we deploy?");
        await model.arrived(1);
        agent.inject("actually, check the logs too");

        expect(await sending).toBe("ship it");
        expect(model.requests()[1]).toContain("actually, check the logs too");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("carries an injection the model never read into the next turn", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([end("all done"), end("ok")]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        await agent.send("deploy it");
        agent.inject("one more thing");
        await agent.send("never mind that");

        const next = JSON.parse(model.requests()[1]).messages;
        expect(
            next
                .filter((message: { role: string }) => message.role === "user")
                .map((message: { content: string }) => message.content),
        ).toEqual(["deploy it", "one more thing", "never mind that"]);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("leaves nothing half-finished when a turn is interrupted", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([
            { ...act({ action: "load_protocol", name: "deploy" }), delay: 20 },
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        const controller = new AbortController();
        const sending = agent.send("how do we deploy?", { signal: controller.signal });
        await model.arrived(1);
        controller.abort();

        expect(sending).rejects.toThrow();
        expect(agent.history).toEqual([{ role: "user", content: "how do we deploy?" }]);
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("stops a model that never ends when a turn limit is set", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([{ delta: { content: "thinking" } }]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
            maxTurns: 2,
        });

        expect(await agent.send("what is 2+2?")).toBe("stopped after 2 turns without ending.");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });

    test("draws a gadget's interface and hands it what the user answered", async () => {
        const home = await mkdtemp(join(tmpdir(), "jeng-e2e-"));
        const model = fakeModel([
            act({ action: "create_gadget", name: "pick", reason: "to ask", source: UI_GADGET }),
            act({ action: "run_gadget", name: "pick" }),
            end("on main"),
        ]);

        const agent = await createAgent({
            cwd: home,
            homes: [home],
            config: CONFIG(model.url),
            approve: allow,
        });
        const events: AgentEvent[] = [];
        agent.setUi(async () => ({ branch: "main" }));

        expect(await agent.send("which branch?", { onEvent: (event) => events.push(event) })).toBe(
            "on main",
        );
        expect(events.filter((event) => event.type === "view")).toHaveLength(1);
        expect(model.requests()[2]).toContain("on main");
        model.stop();
        await rm(home, { recursive: true, force: true });
    });
});
