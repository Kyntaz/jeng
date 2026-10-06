#!/usr/bin/env bun
import { createInterface, type Interface } from "node:readline";
import {
    type Agent,
    type Approval,
    type ApprovalDecision,
    type Approve,
    type Config,
    createAgent,
    isDelete,
    isMode,
    loadConfig,
    type Mode,
} from "@jeng/core";
import { Command } from "commander";
import { approvalText, renderTui } from "./tui";

const collect = (value: string, previous: string[]) => [...previous, value];

// A piped prompt is only read when no argument was given, because reading stdin
// blocks until whoever holds the pipe closes it.
async function piped(): Promise<string> {
    if (process.stdin.isTTY) return "";
    return await Bun.stdin.text();
}

function die(message: string): never {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

// One-shot has no modal, so the whole request goes to stderr and the answer comes
// back as a single line: nothing typed approves, anything typed is why it was
// turned down.
let ask: Interface | undefined;

async function askOnStdin(request: Approval): Promise<ApprovalDecision> {
    if (!process.stdin.isTTY)
        return {
            approved: false,
            reason: "there is no terminal to approve on, so nothing was reviewed",
        };

    ask ??= createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write(`\n⚑ ${approvalText(request)}\n`);

    // A terminal that cannot be read is not consent, so a failed read turns the
    // gadget down rather than letting it through unreviewed.
    const reason = (
        await new Promise<string>((resolve) => {
            try {
                ask?.question("enter to approve, or write why to reject > ", resolve);
            } catch {
                resolve("the prompt could not be read");
            }
        })
    ).trim();

    return reason ? { approved: false, reason } : { approved: true };
}

// --yes answers for anything that runs code, but never for a deletion: a scripted
// run should not be able to throw a home away that nobody was there to see go.
const yes: Approve = async (request) =>
    isDelete(request.kind) ? await askOnStdin(request) : { approved: true };

async function once(agent: Agent, prompt: string): Promise<void> {
    try {
        let streamed = "";
        const reply = await agent.send(prompt, {
            onEvent: (event) => {
                if (event.type === "text") {
                    streamed += event.text;
                    process.stdout.write(event.text);
                }
                if (event.type === "tool") process.stderr.write(`\n⚙ ${event.action}\n`);
                if (event.type === "result") process.stderr.write(`↳ ${event.content}\n`);
            },
        });
        if (reply.trim() !== streamed.trim())
            process.stdout.write(`${streamed.trim() ? "\n" : ""}${reply}`);
        process.stdout.write("\n");
    } finally {
        // Held stdin keeps the process alive, and a turn with nothing to ask about
        // never opened one in the first place.
        ask?.close();
        ask = undefined;
    }
}

async function agentFor(options: {
    home: string[];
    config: string | undefined;
    yes: boolean;
    mode?: Mode;
    maxTurns?: number;
}): Promise<Agent> {
    // A mode that is not one is a typo rather than a mode, and quietly
    // falling back to learn would hand the user an agent that writes.
    if (options.mode !== undefined && !isMode(options.mode))
        die(`mode must be learn or work, not ${options.mode}`);

    // A limit is the user taking the ability to interrupt back, so a
    // nonsense one has to be said rather than clamped.
    if (
        options.maxTurns !== undefined &&
        (!Number.isInteger(options.maxTurns) || options.maxTurns < 1)
    )
        die(`max-turns must be a whole number above zero, not ${options.maxTurns}`);

    let config: Config;
    try {
        config = await loadConfig({ path: options.config, homeArgs: options.home });
    } catch (error) {
        die(error instanceof Error ? error.message : String(error));
    }

    return await createAgent({
        homes: config.homes,
        config: config.model,
        mode: options.mode as Mode | undefined,
        maxTurns: options.maxTurns,
        // --yes never installs the reader on its own, so a scripted run
        // touches no stdin unless it has something to delete.
        approve: options.yes ? yes : askOnStdin,
    });
}

export async function jeng(): Promise<void> {
    await new Command()
        .name("jeng")
        .description("An agent for you.")
        .argument(
            "[prompt...]",
            "run a single prompt and exit instead of opening the TUI; read from stdin when piped in",
        )
        .option("--home <dir>", "home folder; repeat for multiple agents", collect, [])
        .option(
            "--mode <mode>",
            "learn to grow the home, work to use only what it already has; defaults to learn",
        )
        .option(
            "-c, --config <file>",
            "configuration file; defaults to ./jeng.json, then <home>/jeng.json",
        )
        .option(
            "--max-turns <turns>",
            "stop a turn after this many model calls; unbounded by default",
            Number,
        )
        .option(
            "-y, --yes",
            "approve every gadget and protocol without asking; a deletion is always asked for",
        )
        .showHelpAfterError()
        .action(async (prompt: string[], options: Parameters<typeof agentFor>[0]) => {
            const agent = await agentFor(options);
            const text = prompt.length ? prompt.join(" ") : await piped();
            if (text.trim()) await once(agent, text);
            else if (process.stdin.isTTY) await renderTui(agent);
            else die("no prompt given, on the argument or on stdin");
        })
        .parseAsync();
}
