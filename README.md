# Jeng - An agent for you.

Jeng is a bare-bones agent that starts out with zero context and evolves to fit your specific needs.
It is not opinionated, and it starts out knowing nothing except how to learn.
This means that it is an agent that works well with tiny models, since it uses nearly no context out of the box.

## Installation

### Windows

```pwsh
# Add install command here.
```

### Unix

```sh
# Add install command here.
```

## How to use?

```sh
jeng --help
```

## How it works?

Jeng loads up and edits context on the following locations:

- `~/.jeng` (you can change this path through the `JENG_HOME` environment variable or the `--home` argument)
    - `/protocol`
        - `/*.md` (memory files containing situational knowledge that Jeng may want to load into context)
    - `/gadgets`
        - `/*.ts` (tools that Jeng can use to interact with the system; these run on the bun runtime)
    - `/AGENTS.md` (global agents file; always loaded into Jeng's context)

Additionally, Jeng loads up `AGENTS.md` files for the current working directory or any directory above it, following the expected protocol.
You can have multiple `--home` folders to have multiple agents with different capabilities.

> _Pro-tip_: Jeng can call itself under multiple homes, so it can learn to create intricate sub-agent systems to accomplish complex tasks.

## Why "Jeng"?

It's an homage to Johnny English.
