import { type ActionContext, JENG_TOOL, runAction } from "./actions";
import { loadAgentsFiles } from "./agents";
import { defaultHome, defaultModel } from "./config";
import { buildContext, type Memory } from "./context";
import { type Home, loadHomes } from "./home";
import { chat, type Message, type ModelConfig } from "./model";

const MAX_TURNS = 20;

export type AgentEvent =
    | { type: "text"; text: string }
    | { type: "reasoning"; text: string }
    | { type: "tool"; action: string; args: Record<string, unknown> }
    | { type: "result"; content: string; ok: boolean }
    | { type: "usage"; promptTokens: number };

export interface Agent {
    homes: Home[];
    cwd: string;
    history: Message[];
    memory: Memory[];
    clear: () => void;
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
        let previous = "";

        for (let turn = 0; turn < MAX_TURNS; turn++) {
            messages[0].content = buildContext(ctx.homes, agentsFiles, memory);

            const reply = await chat(messages, {
                config,
                tools: [JENG_TOOL],
                signal,
                onDelta: (text) => onEvent?.({ type: "text", text }),
                onReasoning: (text) => onEvent?.({ type: "reasoning", text }),
                onUsage: (promptTokens) => onEvent?.({ type: "usage", promptTokens }),
            });

            const message: Message = {
                role: "assistant",
                content: reply.text,
                toolCall: reply.toolCall,
            };
            history.push(message);
            messages.push(message);
            if (!reply.toolCall) {
                // A thinking model can spend its turn reasoning and end with no
                // answer at all; its reasoning is the closest thing to one.
                if (!reply.text.trim() && reply.reasoning.trim()) return reply.reasoning.trim();
                if (!reply.text.trim()) return "I had nothing to say. Ask me again.";
                return reply.text;
            }

            const { action, ...args } = reply.toolCall.arguments as { action?: string } & Record<
                string,
                unknown
            >;
            const name = String(action ?? "");
            onEvent?.({ type: "tool", action: name, args });

            // A model that reissues the call it just made, having learned
            // nothing in between, will never make progress; report the blocker
            // instead of burning the turn budget. A retry after some other call
            // is legitimate, because the context has changed.
            const signature = `${name}:${JSON.stringify(args)}`;
            if (signature === previous) {
                const stopped = `stopped: "${name}" was called twice in a row with the same arguments. Say what you know instead of calling it again.`;
                onEvent?.({ type: "result", content: stopped, ok: false });
                history.push({
                    role: "tool",
                    toolCallId: reply.toolCall.id,
                    content: stopped,
                });
                return stopped;
            }
            previous = signature;

            const result = await runAction(name, args, ctx);
            onEvent?.({ type: "result", content: result.content, ok: result.ok });
            const toolMessage: Message = {
                role: "tool",
                toolCallId: reply.toolCall.id,
                content: result.content,
            };
            messages.push(toolMessage);
            history.push(toolMessage);

            if (action === "load_protocol" && result.ok)
                memory.push({ name: String(args.name ?? ""), body: result.content });
        }
        return `stopped after ${MAX_TURNS} turns without an answer.`;
    }

    function clear(): void {
        history.length = 0;
        memory.length = 0;
    }

    return { homes: ctx.homes, cwd, history, memory, clear, send };
}
