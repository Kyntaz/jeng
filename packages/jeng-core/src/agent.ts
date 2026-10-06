import { type ActionContext, runAction, surfaceOf } from "./actions";
import { loadAgentsFiles } from "./agents";
import type { Approve } from "./approve";
import { readCall } from "./call";
import { defaultHome, defaultModel } from "./config";
import { buildContext, loadedAgents, type Memory } from "./context";
import type { GuiHost } from "./gui";
import { type Home, loadHomes } from "./home";
import { DEFAULT_MODE, type Mode } from "./mode";
import { chatWithRetry, type Message, type ModelConfig } from "./model";
import { prompt } from "./prompts";
import { sessionState } from "./state";
import { jengTool } from "./tool";
import type { Draw, GuiDraw, Ui } from "./ui";

const NUDGE = prompt("nudge");

export type AgentEvent =
    | { type: "text"; text: string }
    | { type: "reasoning"; text: string }
    | { type: "tool"; action: string; args: Record<string, unknown> }
    | { type: "view"; draw: Draw }
    | { type: "result"; content: string; ok: boolean }
    | { type: "usage"; promptTokens: number };

export interface Agent {
    homes: Home[];
    // Where an AGENTS.md sits, whether it came from a home or from the walk up
    // from the working directory.
    agents: string[];
    cwd: string;
    model: string;
    history: Message[];
    memory: Memory[];
    mode: Mode;
    clear: () => void;
    inject: (text: string) => void;
    setApprove: (approve: Approve) => void;
    // Handing over an interface is what makes a run anything but headless. Which of
    // the two is taken is what the run draws in.
    setUi: (ui: Ui) => void;
    setGui: (gui: GuiHost) => void;
    setMode: (mode: Mode) => void;
    send(
        text: string,
        options?: { signal?: AbortSignal; onEvent?: (event: AgentEvent) => void },
    ): Promise<string>;
}

export interface AgentOptions {
    cwd?: string;
    homes?: string[];
    config?: ModelConfig;
    history?: Message[];
    maxTurns?: number;
    mode?: Mode;
    approve: Approve;
}

export async function createAgent(options: AgentOptions): Promise<Agent> {
    const cwd = options.cwd ?? process.cwd();
    // A gadget is a script and a script runs somewhere, so this is the directory one runs
    // in: the process moves rather than being handed a path, because a gadget's relative
    // paths have to mean the directory on screen rather than wherever jeng was launched.
    process.chdir(cwd);
    const config = options.config ?? defaultModel();
    const homes = await loadHomes(options.homes ?? [defaultHome()]);
    const agentsFiles = await loadAgentsFiles(cwd);
    const agents = loadedAgents(homes, agentsFiles).map((file) => file.dir);
    let approve = options.approve;
    let hostUi: Ui | undefined;
    let hostGui: GuiHost | undefined;
    let mode = options.mode ?? DEFAULT_MODE;
    const ctx: ActionContext = {
        homes,
        cwd,
        approve: (request) => approve(request),
        ui: undefined,
        gui: undefined,
        session: sessionState(),
        get mode() {
            return mode;
        },
    };
    const history = options.history ?? [];
    const memory: Memory[] = [];
    const maxTurns = options.maxTurns ?? Infinity;
    const pending: string[] = [];
    let promptTokens = 0;
    let drawn = 0;

    /**
     * The interface belongs to the host and outlives the turn, while what it draws belongs
     * to this turn's stream, so the two are joined here. Which one it is was decided when
     * the host took it, not here.
     */
    function openPorts(onEvent?: (event: AgentEvent) => void): void {
        const ui = hostUi;
        const gui = hostGui;
        ctx.ui = ui
            ? async (widget) => {
                  onEvent?.({ type: "view", draw: { surface: "tui", widget } });
                  return await ui(widget);
              }
            : undefined;
        ctx.gui = gui
            ? async (file, props) => {
                  // One draw, numbered here and handed to both halves: the transcript and
                  // the host each get their own copy of the request, and the number is
                  // what says later that they were one form.
                  const draw: GuiDraw = { surface: "gui", id: ++drawn, file, props };
                  onEvent?.({ type: "view", draw });
                  return await gui(draw);
              }
            : undefined;
    }

    async function send(
        text: string,
        sendOptions: { signal?: AbortSignal; onEvent?: (event: AgentEvent) => void } = {},
    ): Promise<string> {
        const { signal, onEvent } = sendOptions;
        openPorts(onEvent);
        for (const injected of pending.splice(0)) history.push({ role: "user", content: injected });
        // The system slot is refilled at the top of every turn, so it starts empty.
        const messages: Message[] = [
            { role: "system", content: "" },
            ...history,
            { role: "user", content: text },
        ];
        history.push({ role: "user", content: text });
        let previous = "";
        let nudged = false;

        // history is the Agent's own array, so a compact empties it rather than replacing
        // it; memory and homes are not the transcript.
        const compact = (summary: string) => {
            history.length = 0;
            history.push({
                role: "user",
                content: `[earlier conversation, compacted]\n\n${summary}`,
            });
            messages.length = 0;
            messages.push({ role: "system", content: "" }, ...history);
        };

        for (let turn = 0; turn < maxTurns; turn++) {
            const speaking = mode;
            messages[0].content = buildContext(ctx.homes, agentsFiles, memory, {
                tokens: promptTokens,
                contextWindow: config.contextWindow,
                surface: surfaceOf(ctx),
                mode: speaking,
            });

            // The previous iteration always ended with a result rather than a
            // pending call, so this is the one point where a user message does
            // not break a tool call from its result.
            const incoming = pending.splice(0);
            if (incoming.length === 0 && nudged) incoming.push(NUDGE);
            nudged = false;
            for (const text of incoming) {
                const message: Message = { role: "user", content: text };
                messages.push(message);
                history.push(message);
            }

            // An hour-long outage is one thing to read about, so the reason is said once.
            let reported = false;
            const reply = await chatWithRetry(messages, {
                config,
                tools: [jengTool(speaking)],
                signal,
                onDelta: (text) => onEvent?.({ type: "text", text }),
                onReasoning: (text) => onEvent?.({ type: "reasoning", text }),
                onUsage: (tokens) => {
                    promptTokens = tokens;
                    onEvent?.({ type: "usage", promptTokens: tokens });
                },
                onRetry: (reason, delay) => {
                    if (reported) return;
                    reported = true;
                    onEvent?.({
                        type: "result",
                        ok: false,
                        content: `${reason}. Retrying in ${Math.max(1, Math.round(delay / 1000))}s and backing off from there; esc stops the turn.`,
                    });
                },
            });

            const message: Message = {
                role: "assistant",
                content: reply.text,
                toolCall: reply.toolCall,
            };
            history.push(message);
            messages.push(message);

            // Text on its own is progress towards an answer that has not been
            // handed over yet, so the next iteration nudges.
            if (!reply.toolCall) {
                nudged = true;
                continue;
            }

            const { action, ...args } = reply.toolCall.arguments;
            onEvent?.({ type: "tool", action: String(action ?? ""), args });

            // A call is answered immediately, so its result goes in beside it.
            const paired: Message = { role: "tool", toolCallId: reply.toolCall.id, content: "" };
            const close = (content: string) => {
                paired.content = content;
                messages.push(paired);
                history.push(paired);
            };

            const call = readCall(reply.toolCall.arguments, previous);
            if (call.kind === "refused") {
                onEvent?.({ type: "result", content: call.content, ok: false });
                close(call.content);
                continue;
            }
            if (call.kind === "answer") {
                close("ended");
                return call.answer;
            }
            if (call.kind === "compact") {
                close("compacted");
                compact(call.summary);
                continue;
            }

            previous = call.signature;
            const result = await runAction(call.name, call.args, ctx);
            onEvent?.({ type: "result", content: result.content, ok: result.ok });
            close(result.content);

            if (call.name === "load_protocol" && result.ok)
                memory.push({ name: String(call.args.name ?? ""), body: result.content });
        }
        return `stopped after ${maxTurns} turns without ending.`;
    }

    function clear(): void {
        history.length = 0;
        memory.length = 0;
        // What one gadget left for the next only means something against what
        // they talked about, so the scratch goes with the conversation.
        ctx.session = sessionState();
    }

    return {
        homes: ctx.homes,
        agents,
        cwd,
        model: config.model,
        history,
        memory,
        get mode() {
            return mode;
        },
        clear,
        setApprove: (next) => {
            approve = next;
        },
        setUi: (next) => {
            hostUi = next;
        },
        setGui: (next) => {
            hostGui = next;
        },
        setMode: (next) => {
            mode = next;
        },
        inject: (text: string) => {
            pending.push(text);
        },
        send,
    };
}
