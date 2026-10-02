# Jeng Architecture

## Core ideas

Jeng is the most bare-bones agentic harness possible.
Out of the box, it knows how to create gadgets to interact with the system and how to commit protocols into memory.
The idea is that Jeng grows with you, evolving to fit specifically your needs.
This should make Jeng particularly well suited to work with local or weaker models.

### Jeng concepts

- **AGENTS file** is a file containing information that should always be loaded into the agent's context.
- **Gadget** is a bun script, written in TypeScript, with a special header with information describing how to use the gadget that is added to Jeng's context.
- **Protocol** is a Markdown file with information committed by Jeng, including a special header that gives Jeng information about when it should load the protocol.
- **Action** is something that Jeng can do out-of-the-box.
    - **Create Gadget** creates a new Gadget that can be used later. This checks the Gadget to make sure it is valid and rejects it otherwise.
    - **Create Protocol** creates a new Protocol that can be referenced later. This checks the structure of the protocol to make sure it is valid and rejects it otherwise.
- **Config file** is a JSON file named through `-c`/`--config`, holding the homes to load and the model to talk to.
    - It exists so one disk can carry several agents, each with a config of its own.
    - It is the only source of configuration once found, so the environment is a fallback rather than a second voice.
    - Anything it leaves out falls back to the same default the environment would have supplied, which keeps a config file from having to be complete.

## Configuration

`config` is the single definition of where Jeng's homes and model come from, so a caller never has to know how they were chosen.

- Resolution is one function, because homes and model are decided together and disagreeing with each other would be the confusing case.
- A config file that cannot be read, parsed or understood is an error rather than a silent fallback, because an agent quietly running on the wrong model or the wrong memory is worse than one that refuses to start.
- `createAgent` never reads config itself; it takes homes and a model as given. A library should not depend on the caller's working directory, and the CLI is the only place that knows about `-c`.

## Headers

Both concepts that Jeng reads out of its home carry a header, so the model can be told what exists without being shown everything.

A **Protocol** header is YAML frontmatter, because a protocol is a document and has no reason to look like anything else.

```markdown
---
name: deploy-flow
description: the steps to put this service live
when: deploying to a real environment
---
```

A **Gadget** header is a leading block comment holding the same `field: value` lines.
A gadget is a script that Jeng imports and runs, so its header has to leave the file valid TypeScript.
Frontmatter would not.

```ts
/**
 * name: greet
 * description: greets whoever is named in the input
 */

export default async (input: { who: string }) => `hi ${input.who}`
```

A gadget's default export takes the action's `input` and its return value becomes the action's result.

## Validation

`validate` is the single definition of what a valid gadget or protocol is, and both creation actions go through it before touching the disk.

- Rejections are phrased as one sentence naming the offending field, because that sentence is read by the model, who then gets to fix its own attempt.
- Nothing is written until validation passes, so a rejected creation leaves the home exactly as it was.
- A gadget is compiled but never executed at creation time, so writing a gadget cannot run arbitrary code before you have looked at it.

## Stack

- **bun** is used as the runtime that powers Jeng.
- **TypeScript** is the main programming language for Jeng.
- **OpenTUI** powers the CLI's TUI.
- **commander** to simplify declaration of the CLI itself.
- **React** and **JSX** powers Jeng's UIs, reactivity and state management.
- **Biome** for linting and formatting (`bun run check`).
- **git** for version management.

## File Structure

The following structure includes only the most relevant files and paths of the project.

- `.` (the root of the project)
    - `/package.json` (top level workspace package)
    - `/biome.json` (linter and formatter configuration)
    - `/README.md`
    - `/ARCHITECTURE.md`
    - `/AGENTS.md`
    - `/packages`
        - `/jeng-core` (core jeng behaviors)
            - `/package.json`
            - `/src` (TypeScript files with the core behavior of jeng)
            - `/test`
                `/unit` (unit tests; structure mirrors `../src`)
                `/e2e` (tests mirroring realistic uses of this library)
        - `/jeng-cli` (the CLI to interact with jeng)
            - `/package.json`
            - `/src` (the TypeScript files with the CLI and TUI used to interact with Jeng through a console)
            - `/test`
                - `/unit` (unit tests; structure mirrors `../src`)
                - `/e2e` (tests simulating user journeys interacting with Jeng's CLI)

## Code organization

Each `/src` folder contains a structure of modules and sub-modules.
Folders inside `/src` describe modules with sub-modules and should always have an `index.ts` file.
Each module should only import from sibling modules; there shouldn't be direct imports from the internals of a module.


## Testing strategy

There are two types of tests:

- Unit tests mirror the structure of the source code and validate the behaviors of each exported structure independently.
- E2E tests describe the end to end utilization of the package they're part of.
