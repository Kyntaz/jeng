/**
 * How a token count is said: in thousands once it is a number rather than digits. A context
 * runs to tens of thousands, so the exact figure is noise in a header, and a terminal has
 * less room for it than a window does.
 *
 * Both frontends count this one way, so it lives here rather than in either of them.
 */
export const compact = (tokens: number) =>
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
