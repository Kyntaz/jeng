export interface ModelConfig {
    baseUrl: string;
    apiKey: string | undefined;
    model: string;
    contextWindow: number;
}

export interface Message {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    toolCall?: ToolCall;
    toolCallId?: string;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface Turn {
    text: string;
    reasoning: string;
    toolCall: ToolCall | undefined;
    promptTokens: number;
}

export interface ToolSpec {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

function firstToolCall(delta: Record<string, unknown>) {
    const calls = (delta.tool_calls ?? []) as Record<string, unknown>[];
    const call = calls[0];
    if (!call) return undefined;

    const fn = (call.function ?? {}) as Record<string, unknown>;
    const args = typeof fn.arguments === "string" ? fn.arguments : "";
    return {
        id: typeof call.id === "string" ? call.id : undefined,
        name: typeof fn.name === "string" ? fn.name : "",
        args,
    };
}

async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body
        .pipeThrough(
            new TransformStream({
                transform(chunk, controller) {
                    controller.enqueue(new TextDecoder().decode(chunk, { stream: true }));
                },
            }),
        )
        .getReader();
    let buffer = "";
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        for (let index = buffer.indexOf("\n"); index >= 0; index = buffer.indexOf("\n")) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (line.startsWith("data:")) yield line.slice(5).trim();
        }
    }
}

function wire(message: Message): Record<string, unknown> {
    if (message.role === "tool")
        return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    if (message.toolCall) {
        return {
            role: "assistant",
            content: message.content || null,
            tool_calls: [
                {
                    id: message.toolCall.id,
                    type: "function",
                    function: {
                        name: message.toolCall.name,
                        arguments: JSON.stringify(message.toolCall.arguments),
                    },
                },
            ],
        };
    }
    return { role: message.role, content: message.content };
}

export async function chat(
    messages: Message[],
    options: {
        config: ModelConfig;
        tools?: ToolSpec[];
        onDelta?: (text: string) => void;
        onReasoning?: (text: string) => void;
        onUsage?: (promptTokens: number) => void;
        signal?: AbortSignal;
    },
): Promise<Turn> {
    const { config, tools, onDelta, onReasoning, onUsage, signal } = options;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
            model: config.model,
            messages: messages.map(wire),
            tools: tools?.map((tool) => ({ type: "function", function: tool })),
            tool_choice: "auto",
            stream: true,
            stream_options: { include_usage: true },
        }),
    });

    if (!response.ok || !response.body) {
        throw new Error(
            `model request failed: ${response.status} ${(await response.text()).trim()}`,
        );
    }

    let text = "";
    let reasoning = "";
    let promptTokens = 0;
    let call: { id: string; name: string; args: string } | undefined;

    for await (const data of lines(response.body)) {
        if (data === "[DONE]") break;
        const chunk = JSON.parse(data) as {
            choices?: { delta?: Record<string, unknown> }[];
            usage?: { prompt_tokens?: number };
        };

        const used = chunk.usage?.prompt_tokens;
        if (used) {
            promptTokens = used;
            onUsage?.(used);
        }

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        const piece = delta.content;
        if (typeof piece === "string" && piece) {
            text += piece;
            onDelta?.(piece);
        }

        const thought = delta.reasoning;
        if (typeof thought === "string" && thought) {
            reasoning += thought;
            onReasoning?.(thought);
        }

        const next = firstToolCall(delta);
        if (next) {
            call = {
                id: next.id ?? call?.id ?? "call_0",
                name: next.name || call?.name || "",
                args: (call?.args ?? "") + next.args,
            };
        }
    }

    return {
        text,
        reasoning,
        toolCall: call
            ? { id: call.id, name: call.name, arguments: parseArgs(call.args) }
            : undefined,
        promptTokens,
    };
}

export function parseArgs(args: string): Record<string, unknown> {
    if (!args.trim()) return {};
    try {
        const parsed: unknown = JSON.parse(args);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
            return { error: "arguments must be a json object" };
        return parsed as Record<string, unknown>;
    } catch {
        return { error: `arguments are not valid json: ${args.slice(0, 120)}` };
    }
}
