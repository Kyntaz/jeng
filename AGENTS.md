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
