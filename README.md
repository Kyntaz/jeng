# Jeng - An agent for you.

Jeng is a bare-bones agent that starts out with zero context and evolves to fit your specific needs.
It is not opinionated, and it starts out knowing nothing except how to learn.
This means that it is an agent that works well with tiny models, since it uses nearly no context out of the box.

## Installation

### Windows

```pwsh
bun install -g jeng
```

### Unix

```sh
bun install -g jeng
```

## Configuration

Jeng talks to any OpenAI-compatible endpoint, so a local model works as well as a hosted one.
A config file is JSON, so you can keep one per agent and pick between them:

```json
{
    "homes": ["~/.jeng", "~/work-agent"],
    "model": { "baseUrl": "http://localhost:11434/v1", "apiKey": "sk-...", "model": "gpt-4o-mini" }
}
```

Point Jeng at one with `-c`:

```sh
jeng -c ~/agents/researcher.json "what files are in src?"
```

Without `-c`, Jeng looks for `./jeng.json`, then `jeng.json` inside the first home folder.
Every key is optional, and any key you leave out falls back to its default.

Once a config file is found it is the only source of configuration; the environment is
read only when there is no config file, which keeps existing setups working:

| Variable       | Default                      | Meaning                        |
| -------------- | ---------------------------- | ------------------------------ |
| `JENG_BASE_URL`| `http://localhost:11434/v1`  | OpenAI-compatible base url     |
| `JENG_API_KEY` | `OPENAI_API_KEY`             | sent as a bearer token if set  |
| `JENG_MODEL`   | `gpt-4o-mini`                | model name                     |
| `JENG_HOME`    | `~/.jeng`                    | `;`-separated home folders     |

## How to use?

```sh
jeng --help
```

Run `jeng` on its own for the TUI, or pass a prompt to run once and exit:

```sh
jeng "what files are in src?"
```

## How it works?

Jeng loads up and edits context on the following locations:

- `~/.jeng` (you can change this path through the `homes` key of a config file, the `JENG_HOME` environment variable or the `--home` argument)
    - `/protocols`
        - `/*.md` (memory files containing situational knowledge that Jeng may want to load into context)
    - `/gadgets`
        - `/*.ts` (tools that Jeng can use to interact with the system; these run on the bun runtime)
    - `/AGENTS.md` (global agents file; always loaded into Jeng's context)

Additionally, Jeng loads up `AGENTS.md` files for the current working directory or any directory above it, following the expected protocol.
You can have multiple `--home` folders to have multiple agents with different capabilities.

> _Pro-tip_: Jeng can call itself under multiple homes, so it can learn to create intricate sub-agent systems to accomplish complex tasks.

## Gadgets

A gadget is a TypeScript file that default-exports a function.
Jeng imports it and calls it, handing over the `input` it was given and keeping whatever the function returns.

```ts
/**
 * name: greet
 * description: greets whoever is named in the input
 */

export default async (input: { who: string }) => `hi ${input.who}`
```

Jeng only ever sees the name and the description, so write the description for the model, not for yourself.

## Protocols

A protocol is knowledge Jeng wrote down for its future self.
Jeng sees the `when` field up front so it knows whether a protocol is worth loading, and only pulls in the body when it decides the situation calls for it.

```markdown
---
name: deploy-flow
description: the steps to put this service live
when: deploying to a real environment
---

run `make deploy`, then watch the logs for five minutes before walking away.
```

Both a gadget and a protocol are validated before they are written to disk.
A gadget that doesn't compile or is missing its header is rejected with the reason, and Jeng gets to try again.

## Why "Jeng"?

It's an homage to Johnny English.
