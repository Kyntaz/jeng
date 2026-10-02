import { describe, expect, test } from "bun:test";
import { chat } from "../../src/model";

function fakeModel(replies: Record<string, unknown>[][]) {
    let turn = 0;
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            const body = (await request.json()) as { messages: { role: string; content: string | null; tool_call_id?: string }[] };
            const chunks = replies[turn++] ?? [];
            const stream = chunks
                .map((chunk) => `data: ${JSON.stringify({ choices: [{ delta: chunk }] })}\n\n`)
                .join("") + "data: [DONE]\n\n";
            return new Response(stream, { headers: { "content-type": "text/event-stream" }, });
        },
    });
    return { url: `http://localhost:${server.port}/v1`, sent: () => turn, stop: () => server.stop(true) };
}

describe("model", () => {
    test("streams text deltas and reports them as they arrive", async () => {
        const model = fakeModel([[{ content: "Hel" }, { content: "lo" }]]);
        const deltas: string[] = [];

        const turn = await chat([{ role: "user", content: "hi" }], { config: { baseUrl: model.url, apiKey: undefined, model: "fake" }, onDelta: (text) => deltas.push(text) });

        expect(turn).toEqual({ text: "Hello", toolCall: undefined });
        expect(deltas).toEqual(["Hel", "lo"]);
        model.stop();
    });

    test("reassembles a tool call split across chunks", async () => {
        const model = fakeModel([
            [
                { tool_calls: [{ id: "call_1", function: { name: "jeng", arguments: '{"action":"run_' } }] },
                { tool_calls: [{ function: { arguments: 'gadget","name":"greet"}' } }] },
            ],
        ]);

        const turn = await chat([{ role: "user", content: "hi" }], { config: { baseUrl: model.url, apiKey: undefined, model: "fake" } });

        expect(turn.toolCall).toEqual({ id: "call_1", name: "jeng", arguments: { action: "run_gadget", name: "greet" } });
        model.stop();
    });

    test("falls back to raw input when the arguments are not json", async () => {
        const model = fakeModel([[{ tool_calls: [{ id: "call_1", function: { name: "jeng", arguments: "oops" } }] }]]);

        const turn = await chat([{ role: "user", content: "hi" }], { config: { baseUrl: model.url, apiKey: undefined, model: "fake" } });

        expect(turn.toolCall?.arguments).toEqual({ input: "oops" });
        model.stop();
    });
});