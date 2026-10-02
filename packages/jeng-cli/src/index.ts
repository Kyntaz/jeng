#!/usr/bin/env bun
import { type Agent, createAgent, loadConfig } from "@jeng/core";
import { Command } from "commander";
import { renderTui } from "./tui";

const collect = (value: string, previous: string[]) => [...previous, value];

async function once(agent: Agent, prompt: string): Promise<void> {
    await agent.send(prompt, {
        onEvent: (event) => {
            if (event.type === "text") process.stdout.write(event.text);
            if (event.type === "tool") process.stderr.write(`\n⚙ ${event.action}\n`);
            if (event.type === "result") process.stderr.write(`↳ ${event.content}\n`);
        },
    });
    process.stdout.write("\n");
}

new Command()
    .name("jeng")
    .description("An agent for you.")
    .argument("[prompt...]", "run a single prompt and exit instead of opening the TUI")
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
        const text = prompt.join(" ");
        if (text) await once(agent, text);
        else await renderTui(agent);
    })
    .parse();
