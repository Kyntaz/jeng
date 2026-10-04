#!/usr/bin/env bun
import { createInterface, type Interface } from "node:readline";
import {
    type Agent,
    type Approval,
    type ApprovalDecision,
    type Approve,
    createAgent,
    isDelete,
    loadConfig,
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

// One-shot has no modal, so the whole request goes to stderr and the answer comes
// back as a single line: nothing typed approves, anything typed is why it was
// turned down. The interface lives as long as the run because a turn can ask more
// than once.
let ask: Interface | undefined;

async function askOnStdin(request: Approval): Promise<ApprovalDecision> {
    if (!process.stdin.isTTY)
        return {
            approved: false,
            reason: "there is no terminal to approve on, so nothing was reviewed",
        };

    ask ??= createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write(`\n${approvalText(request)}\n`);

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
        // Text streamed before `end` is progress, not the answer, so it goes out as
        // it arrives and the answer is only appended when it is not already there.
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

await new Command()
    .name("jeng")
    .description("An agent for you.")
    .argument(
        "[prompt...]",
        "run a single prompt and exit instead of opening the TUI; read from stdin when piped in",
    )
    .option("--home <dir>", "home folder; repeat for multiple agents", collect, [])
    .option(
        "-c, --config <file>",
        "configuration file; defaults to ./jeng.json, then <home>/jeng.json",
    )
    .option(
        "-y, --yes",
        "approve every gadget and protocol without asking; a deletion is always asked for",
    )
    .showHelpAfterError()
    .action(
        async (
            prompt: string[],
            options: { home: string[]; config: string | undefined; yes: boolean },
        ) => {
            let config: Awaited<ReturnType<typeof loadConfig>>;
            try {
                config = await loadConfig({ path: options.config, homeArgs: options.home });
            } catch (error) {
                process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
                process.exit(1);
            }

            const agent = await createAgent({
                homes: config.homes,
                config: config.model,
                // --yes never installs the reader on its own, so a scripted run
                // touches no stdin unless it has something to delete.
                approve: options.yes ? yes : askOnStdin,
            });
            const text = prompt.length ? prompt.join(" ") : await piped();
            if (text.trim()) await once(agent, text);
            else if (process.stdin.isTTY) await renderTui(agent);
            else {
                process.stderr.write("no prompt given, on the argument or on stdin\n");
                process.exit(1);
            }
        },
    )
    .parseAsync();
