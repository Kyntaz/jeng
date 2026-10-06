# Instructions for agents working on Jeng

## Core principles

- The best code is no code.
- The best documentation is no documentation.

## Writing style

- Write as little as possible.
- Be direct.
- Never repeat information, reference relevant information where needed.
- Keep related information close together.
- Prefer lists over long paragraphs.
- Use concrete examples and metaphors to explain things.

## Coding style

- Write as little code as possible.
- Don't write comments. If you need a comment, change your code to make it clearer instead.
- If you really need to write a comment, it should explain why the code exists, not what it does. And keep the explanation to a single short line.
- Avoid repetition within related code, but keep unrelated pieces of code unlinked -- changing a piece of code should never affect unrelated code.
- Combine functional, object oriented and procedural approaches, whichever fits the problem best.
- Don't write code that isn't used and don't export constructs that aren't imported.
- Keep modules under 300 lines, and make sure everything a module exports is related.
- Formatting is Biome's job: run `bun run format` instead of hand-aligning whitespace. `bun run check` runs the formatter and the linter together, and must pass.

### Barrels

- Every folder inside `src` has an `index.ts` re-exporting what that folder holds; `src/index.ts` re-exports what the package holds. It is the one file to edit when a module's shape moves.
- A barrel re-exports and does nothing else. Logic belonging to a folder is a sibling of its `index.ts`, never inside it.
- A module imports its siblings by path, and a child folder through its `index.ts`. Importing a file inside a child folder is reaching behind the barrel that declares it.
- Across packages, go through the `exports` map. A declared subpath is a front door; an undeclared deep path is not.
- A module the window can reach takes its values from `@jeng/view` and only types from `@jeng/core`, so no barrel drags `node:` into a browser. `window.test.ts` builds the window refusing `node:` and fails the moment one gets in.
- The `index.ts` an application is launched through is the exception: it holds the code that runs, so it should be little more than a call.

### Tests

- General coding guidelines apply.
- Tests follow an arrange, act, assert structure.
- Each test should validate a single behavior and have a single assertion. Multiple assertions can be ok if they all validate a single concept (e.g. asserting the shape and most relevant values of a single object)
- Each test file has a single top-level `describe`.
- Tests should be completely independent from each other, favoring repeating code over abstracting things away or writing utils.

## When to update documentation

- When specifically requested.
- When some information in it is out of date.
- When something new similar to something already present in the documentation is added.
- You should not add detail to the existing documentation unless specifically requested.
