import { prompt } from "./prompts";

export const MODES = ["learn", "work"] as const;

export type Mode = (typeof MODES)[number];

export const DEFAULT_MODE: Mode = "learn";

// Everything that changes the home, plus load_ui, which exists only to describe
// writing a gadget that draws. Work mode has none of them: the last three change
// the home, and the first two would spend a turn writing something it could never
// keep.
export const GROWS: readonly string[] = [
    "create_gadget",
    "test_gadget",
    "create_protocol",
    "delete_gadget",
    "delete_protocol",
    "load_ui",
];

export function isMode(value: unknown): value is Mode {
    return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

export function identity(mode: Mode): string {
    return [prompt(mode === "work" ? "identity-work" : "identity-learn"), prompt("rules")].join(
        "\n\n",
    );
}
