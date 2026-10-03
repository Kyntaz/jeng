import { describe, expect, test } from "bun:test";
import { chat } from "../../src/model";

function fakeModel(replies: Record<string, unknown>[][], promptTokens = 0) {
    let turn = 0;
    const server = Bun.serve({
        port: 0,
        async fetch() {
            const chunks = replies[turn++] ?? [];
            const frames = chunks.map(
                (chunk) => `data: ${JSON.stringify({ choices: [{ delta: chunk }] })}\n\n`,
            );
            frames.push(
                `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: promptTokens } })}\n\n`,
            );
            return new Response([...frames, "data: [DONE]\n\n"].join(""), {
                headers: { "content-type": "text/event-stream" },
            });
        },
    });
    return {
        url: `http://localhost:${server.port}/v1`,
        sent: () => turn,
        stop: () => server.stop(true),
    };
}

describe("model", () => {
    test("streams text deltas and reports them as they arrive", async () => {
        const model = fakeModel([[{ content: "Hel" }, { content: "lo" }]]);
        const deltas: string[] = [];

        const turn = await chat([{ role: "user", content: "hi" }], {
            config: { baseUrl: model.url, apiKey: undefined, model: "fake", contextWindow: 8192 },
            onDelta: (text) => deltas.push(text),
        });

        expect(turn).toEqual({
            text: "Hello",
            reasoning: "",
            toolCall: undefined,
            promptTokens: 0,
        });
        expect(deltas).toEqual(["Hel", "lo"]);
        model.stop();
    });

    test("reports reasoning deltas separately from the answer", async () => {
        const model = fakeModel([
            [{ reasoning: "think" }, { reasoning: "ing" }, { content: "hi" }],
        ]);
        const thoughts: string[] = [];

        const turn = await chat([{ role: "user", content: "hi" }], {
            config: { baseUrl: model.url, apiKey: undefined, model: "fake", contextWindow: 8192 },
            onReasoning: (text) => thoughts.push(text),
        });

        expect({ reasoning: turn.reasoning, text: turn.text }).toEqual({
            reasoning: "thinking",
            text: "hi",
        });
        expect(thoughts).toEqual(["think", "ing"]);
        model.stop();
    });

    test("reports the prompt size the model was actually given", async () => {
        const model = fakeModel([[{ content: "hi" }]], 4321);
        const sizes: number[] = [];

        const turn = await chat([{ role: "user", content: "hi" }], {
            config: { baseUrl: model.url, apiKey: undefined, model: "fake", contextWindow: 8192 },
            onUsage: (promptTokens) => sizes.push(promptTokens),
        });

        expect(turn.promptTokens).toBe(4321);
        expect(sizes).toEqual([4321]);
        model.stop();
    });

    test("reassembles a tool call split across chunks", async () => {
        const model = fakeModel([
            [
                {
                    tool_calls: [
                        { id: "call_1", function: { name: "jeng", arguments: '{"action":"run_' } },
                    ],
                },
                { tool_calls: [{ function: { arguments: 'gadget","name":"greet"}' } }] },
            ],
        ]);

        const turn = await chat([{ role: "user", content: "hi" }], {
            config: { baseUrl: model.url, apiKey: undefined, model: "fake", contextWindow: 8192 },
        });

        expect(turn.toolCall).toEqual({
            id: "call_1",
            name: "jeng",
            arguments: { action: "run_gadget", name: "greet" },
        });
        model.stop();
    });

    test("hands malformed arguments back as an error instead of a gadget input", async () => {
        const model = fakeModel([
            [{ tool_calls: [{ id: "call_1", function: { name: "jeng", arguments: "oops" } }] }],
        ]);

        const turn = await chat([{ role: "user", content: "hi" }], {
            config: { baseUrl: model.url, apiKey: undefined, model: "fake", contextWindow: 8192 },
        });

        expect(turn.toolCall?.arguments.error).toBe("arguments are not valid json: oops");
        model.stop();
    });

    test("refuses arguments that are not a json object", async () => {
        const model = fakeModel([
            [{ tool_calls: [{ id: "call_1", function: { name: "jeng", arguments: "[1,2]" } }] }],
        ]);

        const turn = await chat([{ role: "user", content: "hi" }], {
            config: { baseUrl: model.url, apiKey: undefined, model: "fake", contextWindow: 8192 },
        });

        expect(turn.toolCall?.arguments).toEqual({ error: "arguments must be a json object" });
        model.stop();
    });
});
