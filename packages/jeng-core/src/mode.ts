import { prompt } from "./prompts";

export const MODES = ["learn", "work"] as const;

export type Mode = (typeof MODES)[number];

export const DEFAULT_MODE: Mode = "learn";

// Everything that changes the home, plus the two that only exist to help write one:
// load_ui, the language of a gadget that draws, and load_gadget, which is worth
// nothing to a run that cannot rewrite what it reads.
export const GROWS: readonly string[] = [
    "create_gadget",
    "test_gadget",
    "create_protocol",
    "delete_gadget",
    "delete_protocol",
    "load_ui",
    "load_gadget",
];

export function isMode(value: unknown): value is Mode {
    return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export function identity(mode: Mode): string {
    return [prompt(mode === "work" ? "identity-work" : "identity-learn"), prompt("rules")].join(
        "\n\n",
    );
}
