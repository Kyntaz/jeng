import { GUI_TOKENS, type Style } from "@jeng/core";

/**
 * The style as the document is handed it: one custom property per token, on the root, so
 * everything in scope reads it -- including a gadget's component, which is served the same
 * stylesheet and so has the same variables in scope.
 *
 * The three `--jeng-accent*` names are not tokens. They are what the window points them at
 * for the mode in force, so a style says what each mode looks like once rather than the
 * window repeating it, and a gadget writing `var(--jeng-accent)` still works unchanged.
 *
 * Appended to the stylesheet rather than written into it, at the same specificity and
 * later in the document, which is what makes the two the same rule rather than a fallback.
 */
export function roots(style: Style): string {
    const body = GUI_TOKENS.map((token) => `    --jeng-${token}: ${style.gui[token]};`).join("\n");

    return `/* The style in force, appended to the stylesheet rather than written into it. */
:root {
${body}
    --jeng-accent: var(--jeng-learn-accent);
    --jeng-accent-tint: var(--jeng-learn-accent-tint);
    --jeng-accent-ink: var(--jeng-learn-accent-ink);
}
`;
}
