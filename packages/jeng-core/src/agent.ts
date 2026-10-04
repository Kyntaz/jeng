import { type ActionContext, runAction } from "./actions";
import { loadAgentsFiles } from "./agents";
import type { Approve } from "./approve";
import { defaultHome, defaultModel } from "./config";
import { buildContext, type Memory } from "./context";
import { type Home, loadHomes } from "./home";
import { chat, type Message, type ModelConfig } from "./model";
import { JENG_TOOL } from "./tool";
import type { Ui, Widget } from "./ui";

const NUDGE =
    'That was plain text, which does not reach the user. Call action="end" with that answer now, or call a tool if you still need one.';

export type AgentEvent =
    | { type: "text"; text: string }
    | { type: "reasoning"; text: string }
    | { type: "tool"; action: string; args: Record<string, unknown> }
    | { type: "view"; widget: Widget }
    | { type: "result"; content: string; ok: boolean }
    | { type: "usage"; promptTokens: number };

export interface Agent {
    homes: Home[];
    cwd: string;
    history: Message[];
    memory: Memory[];
    clear: () => void;
    inject: (text: string) => void;
    // A UI has no approver until it has rendered, so this is how one takes over
    // from the handler the agent was built with.
    setApprove: (approve: Approve) => void;
    // Handing over an interface is what makes a run anything but headless.
    setUi: (ui: Ui) => void;
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
    maxTurns?: number;
    approve: Approve;
}

export async function createAgent(options: AgentOptions): Promise<Agent> {
    const cwd = options.cwd ?? process.cwd();
    const config = options.config ?? defaultModel();
    const homes = await loadHomes(options.homes ?? [defaultHome()]);
    const agentsFiles = await loadAgentsFiles(cwd);
    let approve = options.approve;
    let hostUi: Ui | undefined;
    const ctx: ActionContext = {
        homes,
        cwd,
        approve: (request) => approve(request),
        ui: undefined,
    };
    const history = options.history ?? [];
    const memory: Memory[] = [];
    const maxTurns = options.maxTurns ?? Infinity;
    const pending: string[] = [];
    let promptTokens = 0;

    async function send(
        prompt: string,
        sendOptions: { signal?: AbortSignal; onEvent?: (event: AgentEvent) => void } = {},
    ): Promise<string> {
        const { signal, onEvent } = sendOptions;
        const owned = hostUi;
        // The interface belongs to the host and outlives the turn, while the widgets
        // it draws belong to this turn's stream, so the two are joined here.
        ctx.ui = owned
            ? async (widget) => {
                  onEvent?.({ type: "view", widget });
                  return await owned(widget);
              }
            : undefined;
        // Anything injected after the last turn ended never got read by the
        // model, so it becomes part of the conversation before this prompt
        // rather than an oddity trailing the next one.
        for (const text of pending.splice(0)) history.push({ role: "user", content: text });
        const messages: Message[] = [
            { role: "system", content: "" },
            ...history,
            { role: "user", content: prompt },
        ];
        history.push({ role: "user", content: prompt });
        let previous = "";
        let nudged = false;

        for (let turn = 0; turn < maxTurns; turn++) {
            messages[0].content = buildContext(ctx.homes, agentsFiles, memory, {
                tokens: promptTokens,
                contextWindow: config.contextWindow,
                ui: Boolean(ctx.ui),
            });

            // The previous iteration always ended with a result rather than a
            // pending call, so this is the one point where a user message does
            // not break a tool call from its result.
            const incoming = pending.splice(0);
            if (incoming.length === 0 && nudged) incoming.push(NUDGE);
            for (const text of incoming) {
                const message: Message = { role: "user", content: text };
                messages.push(message);
                history.push(message);
            }
            nudged = false;

            const reply = await chat(messages, {
                config,
                tools: [JENG_TOOL],
                signal,
                onDelta: (text) => onEvent?.({ type: "text", text }),
                onReasoning: (text) => onEvent?.({ type: "reasoning", text }),
                onUsage: (tokens) => {
                    promptTokens = tokens;
                    onEvent?.({ type: "usage", promptTokens: tokens });
                },
            });

            const message: Message = {
                role: "assistant",
                content: reply.text,
                toolCall: reply.toolCall,
            };
            history.push(message);
            messages.push(message);

            const { action, ...args } = (reply.toolCall?.arguments ?? {}) as {
                action?: string;
            } & Record<string, unknown>;
            const name = String(action ?? "");

            if (reply.toolCall) {
                onEvent?.({ type: "tool", action: name, args });

                const paired: Message = {
                    role: "tool",
                    toolCallId: reply.toolCall.id,
                    content: "",
                };
                const close = (content: string) => {
                    paired.content = content;
                    messages.push(paired);
                    history.push(paired);
                };

                if (name === "end") {
                    const answer = String(args.content ?? "").trim();
                    if (!answer) {
                        const complaint =
                            "end was called with no content. Put the answer in content.";
                        onEvent?.({ type: "result", content: complaint, ok: false });
                        close(complaint);
                        continue;
                    }
                    close("ended");
                    return answer;
                }

                if (name === "compact") {
                    const summary = String(args.summary ?? "").trim();
                    if (!summary) {
                        const complaint = "compact was called with no summary. Say what to keep.";
                        onEvent?.({ type: "result", content: complaint, ok: false });
                        close(complaint);
                        continue;
                    }
                    close("compacted");

                    // The pending compact call goes with the rest of the
                    // transcript, so nothing is left needing a result. history is
                    // aliased onto the Agent, so it is emptied rather than
                    // replaced; memory and homes are not the transcript.
                    history.length = 0;
                    history.push({
                        role: "user",
                        content: `[earlier conversation, compacted]\n\n${summary}`,
                    });
                    messages.length = 0;
                    messages.push({ role: "system", content: "" }, ...history);
                    continue;
                }

                // A model that reissues the call it just made, having learned
                // nothing in between, will never make progress; report the blocker
                // instead of looping on it. A retry after some other call is
                // legitimate, because the context has changed.
                const signature = `${name}:${JSON.stringify(args)}`;
                if (signature === previous) {
                    const stopped = `stopped: "${name}" was called twice in a row with the same arguments. Say what you know instead of calling it again.`;
                    onEvent?.({ type: "result", content: stopped, ok: false });
                    close(stopped);
                    return stopped;
                }
                previous = signature;

                const result = await runAction(name, args, ctx);
                onEvent?.({ type: "result", content: result.content, ok: result.ok });
                close(result.content);

                if (action === "load_protocol" && result.ok)
                    memory.push({ name: String(args.name ?? ""), body: result.content });
                continue;
            }

            // Nothing you say ends a turn, so plain text is progress towards an
            // answer you have not handed over yet. The next iteration nudges.
            nudged = true;
        }
        return `stopped after ${maxTurns} turns without ending.`;
    }

    function clear(): void {
        history.length = 0;
        memory.length = 0;
    }

    return {
        homes: ctx.homes,
        cwd,
        history,
        memory,
        clear,
        setApprove: (next) => {
            approve = next;
        },
        setUi: (next) => {
            hostUi = next;
        },
        inject: (text: string) => {
            pending.push(text);
        },
        send,
    };
}
