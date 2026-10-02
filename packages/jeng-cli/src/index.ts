#!/usr/bin/env bun
import { Command } from "commander";
import { createAgent, resolveConfig } from "@jeng/core";
import { renderTui } from "./tui";

const collect = (value: string, previous: string[]) => [...previous, value];

async function once(homes: string[], prompt: string): Promise<void> {
    const agent = await createAgent({ homes: homes.length > 0 ? homes : undefined });
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
    .showHelpAfterError()
    .action(async (prompt: string[], options: { home: string[] }) => {
        const text = prompt.join(" ");
        if (text) await once(options.home, text);
        else {
            const agent = await createAgent({ homes: options.home.length > 0 ? options.home : undefined, config: resolveConfig() });
            await renderTui(agent);
        }
    })
    .parse();