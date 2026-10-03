import type { Entry } from "./entries";

export const BORDER: Record<string, string> = { user: "#5fb3d4", jeng: "#d9a441" };

// Jeng's thinking and tools belong in its box; an error belongs to neither speaker.
export const OWNER: Record<Entry["kind"], keyof typeof BORDER | undefined> = {
    user: "user",
    jeng: "jeng",
    think: "jeng",
    tool: "jeng",
    error: undefined,
};

export const COLORS: Record<Entry["kind"], string | undefined> = {
    user: undefined,
    jeng: undefined,
    think: "#6c6c80",
    tool: "#d9a441",
    error: "#e06c75",
};

export const GUTTERS = { error: "err " };
