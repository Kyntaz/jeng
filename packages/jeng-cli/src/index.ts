#!/usr/bin/env bun
import { type Agent, createAgent, loadConfig } from "@jeng/core";
import { Command } from "commander";
import { renderTui } from "./tui";

const collect = (value: string, previous: string[]) => [...previous, value];

// A piped prompt is only read when no argument was given, because reading stdin
// blocks until whoever holds the pipe closes it.
async function piped(): Promise<string> {
    if (process.stdin.isTTY) return "";
    return await Bun.stdin.text();
}

async function once(agent: Agent, prompt: string): Promise<void> {
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
    .showHelpAfterError()
    .action(async (prompt: string[], options: { home: string[]; config: string | undefined }) => {
        let config: Awaited<ReturnType<typeof loadConfig>>;
        try {
            config = await loadConfig({ path: options.config, homeArgs: options.home });
        } catch (error) {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exit(1);
        }

        const agent = await createAgent({ homes: config.homes, config: config.model });
        const text = prompt.length ? prompt.join(" ") : await piped();
        if (text.trim()) await once(agent, text);
        else if (process.stdin.isTTY) await renderTui(agent);
        else {
            process.stderr.write("no prompt given, on the argument or on stdin\n");
            process.exit(1);
        }
    })
    .parseAsync();
