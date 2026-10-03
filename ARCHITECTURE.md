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
    - **End** hands control back to the user. It is the only way a turn finishes, so an answer is a call rather than text.
    - **Compact** replaces the transcript with a summary the model writes, so a long turn can keep going instead of running out of context.
- **Config file** is a JSON file named through `-c`/`--config`, holding the homes to load and the model to talk to.
    - It exists so one disk can carry several agents, each with a config of its own.
    - It is the only source of configuration once found, so the environment is a fallback rather than a second voice.
    - Anything it leaves out falls back to the same default the environment would have supplied, which keeps a config file from having to be complete.

## Turns

A turn is one message from the user to the moment Jeng hands control back, which it only does through `end`. Keeping a turn well formed is most of what separates an agent that works from one that spirals, so the rules are few and stated once.

- Every message Jeng sends is one call. Text on its own is progress, not an answer, and a model that narrates and then keeps working is doing the right thing rather than finishing.
- An assistant message carrying a call is always followed by the message carrying that call's result, in the history as well as in the request. A history that keeps the request and forgets the result replays a call the model never saw answered, which is what sends it round again.
- The same action with the same arguments twice in a row means nothing changed in between, so the agent stops and says so. The same action again *after* something else is legitimate, because the context moved.
- Arguments that are not a JSON object come back as an error rather than being handed to a gadget.
- A gadget is named after the header it was validated against, not after whatever the model called it, so the name the model reads back is the name on disk.
- Creating a gadget that already exists rewrites it. The model cannot edit files, so refusing would leave it unable to fix a gadget it is unhappy with.
- There is no turn limit, because a model that gets stuck should be interrupted rather than cut off at some number the user has to guess. Immediate repetition is the only automatic stop, so a model that alternates two calls has to be interrupted by hand.

### Interruptions and injections

The user is not held back while Jeng works, in either direction.

- The input box stays focused, so anything typed during a turn reaches the model between two of its calls rather than interrupting one. A tool call is only ever answered immediately, so that boundary is the one point where a new user message cannot break a call from its result.
- Aborting throws out of the model request before the reply is recorded, so an interrupted turn leaves nothing half-finished in the history.
- A gadget already running is not abortable, because a gadget is a function called in-process rather than a process of its own. Interrupting takes effect once it returns.

## Configuration

`config` is the single definition of where Jeng's homes and model come from, so a caller never has to know how they were chosen.

- Resolution is one function, because homes and model are decided together and disagreeing with each other would be the confusing case.
- A config file that cannot be read, parsed or understood is an error rather than a silent fallback, because an agent quietly running on the wrong model or the wrong memory is worse than one that refuses to start.
- `createAgent` never reads config itself; it takes homes and a model as given. A library should not depend on the caller's working directory, and the CLI is the only place that knows about `-c`.
- The context window is configured rather than assumed, because a wrong guess is what makes an agent compact too late to be useful.

## Context

Jeng cannot see how full its own context is, so it is told: the token count from the last request is the first line of its context, and past four fifths of the window that line tells it to compact.

- The model decides *what* to keep by writing the summary, and *when* to do it by reading the number. Jeng does not truncate on its own, because a summary it wrote itself is worth more than the most recent messages.
- Compaction drops the transcript and nothing else. Loaded protocols are memory rather than conversation, so they survive it.
- The count is one request old, which is exact enough: it is the size of the request the model is about to make.

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
- A gadget whose name already exists is overwritten rather than rejected, because the model has no way to edit a file it is unhappy with. It is still validated first, so a rewrite cannot be a way in either.

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
