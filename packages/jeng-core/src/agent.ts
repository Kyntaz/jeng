import { type ActionContext, JENG_TOOL, runAction } from "./actions";
import { loadAgentsFiles } from "./agents";
import { defaultHome, defaultModel } from "./config";
import { buildContext, type Memory } from "./context";
import { type Home, loadHomes } from "./home";
import { chat, type Message, type ModelConfig } from "./model";

const MAX_TURNS = 20;

export type AgentEvent =
    | { type: "text"; text: string }
    | { type: "tool"; action: string; args: Record<string, unknown> }
    | { type: "result"; content: string; ok: boolean };

export interface Agent {
    homes: Home[];
    cwd: string;
    history: Message[];
    memory: Memory[];
    send(
        prompt: string,
        options?: { signal?: AbortSignal; onEvent?: (event: AgentEvent) => void },
    ): Promise<string>;
}

export interface AgentOptions {
    cwd?: string;
    homes?: string[];
    config?: ModelConfig;
    history?: Message[];
}

export async function createAgent(options: AgentOptions = {}): Promise<Agent> {
    const cwd = options.cwd ?? process.cwd();
    const config = options.config ?? defaultModel();
    const homes = await loadHomes(options.homes ?? [defaultHome()]);
    const agentsFiles = await loadAgentsFiles(cwd);
    const ctx: ActionContext = { homes, cwd };
    const history = options.history ?? [];
    const memory: Memory[] = [];

    async function send(
        prompt: string,
        sendOptions: { signal?: AbortSignal; onEvent?: (event: AgentEvent) => void } = {},
    ): Promise<string> {
        const { signal, onEvent } = sendOptions;
        const messages: Message[] = [
            { role: "system", content: "" },
            ...history,
            { role: "user", content: prompt },
        ];
        history.push({ role: "user", content: prompt });

        for (let turn = 0; turn < MAX_TURNS; turn++) {
            messages[0].content = buildContext(ctx.homes, agentsFiles, memory);

            const reply = await chat(messages, {
                config,
                tools: [JENG_TOOL],
                signal,
                onDelta: (text) => onEvent?.({ type: "text", text }),
            });

            const message: Message = {
                role: "assistant",
                content: reply.text,
                toolCall: reply.toolCall,
            };
            history.push(message);
            messages.push(message);
            if (!reply.toolCall) return reply.text;

            const { action, ...args } = reply.toolCall.arguments as { action?: string } & Record<
                string,
                unknown
            >;
            onEvent?.({ type: "tool", action: String(action ?? ""), args });

            const result = await runAction(String(action ?? ""), args, ctx);
            onEvent?.({ type: "result", content: result.content, ok: result.ok });
            messages.push({ role: "tool", toolCallId: reply.toolCall.id, content: result.content });

            if (action === "load_protocol" && result.ok)
                memory.push({ name: String(args.name ?? ""), body: result.content });
        }
        return "";
    }

    return { homes: ctx.homes, cwd, history, memory, send };
}
