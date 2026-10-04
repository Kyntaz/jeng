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
    "model": {
        "baseUrl": "http://localhost:11434/v1",
        "apiKey": "sk-...",
        "model": "gpt-4o-mini",
        "contextWindow": 8192
    }
}
```

Point Jeng at one with `-c`:

```sh
jeng -c ~/agents/researcher.json "what files are in src?"
```

A home is a folder Jeng writes to, so a home of `~` on its own is rejected: that is your
whole home folder rather than a folder inside it. Use `~/.jeng` or name a subfolder.

Without `-c`, Jeng looks for `./jeng.json`, then `jeng.json` inside the first home folder.
Every key is optional, and any key you leave out falls back to its default.

Once a config file is found it is the only source of configuration; the environment is
read only when there is no config file, which keeps existing setups working:

| Variable       | Default                      | Meaning                        |
| -------------- | ---------------------------- | ------------------------------ |
| `JENG_BASE_URL`| `http://localhost:11434/v1`  | OpenAI-compatible base url     |
| `JENG_API_KEY` | `OPENAI_API_KEY`             | sent as a bearer token if set  |
| `JENG_MODEL`   | `gpt-4o-mini`                | model name                     |
| `JENG_CONTEXT` | `8192`                       | context window, in tokens      |
| `JENG_HOME`    | `~/.jeng`                    | `;`-separated home folders     |

## How to use?

```sh
jeng --help
```

Run `jeng` on its own for the TUI, or pass a prompt to run once and exit:

```sh
jeng "what files are in src?"
```

A prompt can also be piped in, which is how you hand Jeng a whole file:

```sh
cat src/index.ts | jeng "what does this do?"
```

A piped run has no terminal to ask on, so it cannot create anything: pass `-y`/`--yes` if the
run is yours and you trust it to write to the home folder.

The TUI shows the context size the model is actually working with, and has a few keys of its own:

| Key           | Does                                        |
| ------------- | ------------------------------------------- |
| `enter`       | send the prompt, or approve what Jeng asks  |
| `shift+enter` | start a new line in the prompt              |
| `ctrl+esc`    | quit                                        |
| `ctrl+l`      | clear the conversation and loaded protocols |
| `esc`         | interrupt what Jeng is doing right now      |
| `ctrl+r`      | show or hide what the model is thinking      |

When a gadget puts an interface in front of you, the prompt box gives up the keys until you have
answered it and `tab` walks between its fields.

`shift+enter` needs a terminal that reports modified keys, such as any with the kitty keyboard protocol.
The prompt box stays focused while Jeng works, so you can keep typing.
Anything you send mid-turn reaches the model between two of its calls instead of cutting the current one short, and `esc` is what cuts it short.

## How it works?

Jeng keeps working until it decides it has an answer, and there is no time limit on that.
Your answer is a call rather than something Jeng says in passing, so Jeng narrating while it works never reads as a finished turn.

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
 * description: greets whoever is named in the input. input: { who: string }
 */

export default async (input: { who: string }) => `hi ${input.who}`
```

Jeng only ever sees the name and the description, so write the description for the model, not for yourself.
Name the input fields in it: that description is all Jeng has to go on when it later calls the gadget.

Jeng writes gadgets for itself, and it shows you the whole file before it saves or runs one.
Ask it to iterate on a gadget and it will run it throwaway first, so you get asked about code that is
already working rather than code that is still being guessed at.
Deleting a gadget is the one thing `--yes` will not do for it, because there is no undo and no backup.

### Gadgets with an interface

A gadget can take a second argument and put an interface of its own in front of the user:

```ts
/**
 * name: pick-branch
 * ui: true
 * description: asks which branch to switch to. input: { repo: string }
 */

export default async (input: { repo: string }, ui: Ui) => {
    ui({ kind: "text", content: `${input.repo} is on ${await branch(input.repo)}` });

    const answers = await ui({
        kind: "box",
        direction: "col",
        children: [
            { kind: "select", name: "branch", question: "which branch?", options: branches(input.repo) },
            { kind: "input", name: "why", question: "why that one?" },
        ],
    });

    if (!answers.branch) return "the user changed their mind";
    return await Bun.$`git -C ${input.repo} checkout ${answers.branch}`.text();
}
```

`ui` draws a tree of widgets and waits, so one call is one round trip: everything in that tree is asked
in one go, and what comes back is `{ name: answer }` for every field the user filled in. A field they
walked away from is missing rather than empty. `tab` moves between fields, `enter` answers the focused
one, the form is sent as soon as the last field has an answer, and `esc` abandons it.

Ask Jeng for the language before writing one:

```json
{"action": "load_ui"}
```

A widget is `text`, `markdown`, `code`, `diff`, `box`, `select`, `input` or `textarea`, and only the
last three ask the user anything. Markdown gives headings, lists and tables; `diff` wants a real
unified diff, which is what `git diff` already hands you.

> A gadget that draws needs `* ui: true` in its header, or Jeng will not offer it to itself later.
> It can only run where there is a terminal to draw on, which is the TUI: a piped or one-shot run has
> nowhere to show it, so those gadgets are left out of Jeng's list entirely and Jeng is told to say so
> rather than to try.

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

A protocol Jeng got wrong is worth as little as a gadget that does the wrong thing, so Jeng can delete one
too. It shows you the body first and tells you why it wants it gone; nothing is removed without you saying yes.

## Why "Jeng"?

It's an homage to Johnny English.
