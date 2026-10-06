import { prompt } from "./prompts";

/**
 * What a call the model made means for the turn. The two that end or rewrite a turn are
 * answered here rather than inside the turn loop, because both are all or nothing: a good
 * one is over, and an empty one is refused in the same shape as a repeat.
 */
type Call =
    | { kind: "answer"; answer: string }
    | { kind: "compact"; summary: string }
    | { kind: "refused"; content: string }
    | { kind: "act"; name: string; args: Record<string, unknown>; signature: string };

export function readCall(given: Record<string, unknown>, previous: string): Call {
    const { action, ...args } = given;
    const name = String(action ?? "");

    // Arguments that were never json carry the reason under `error` instead of an action,
    // so the reason is what comes back rather than an unknown action with an empty name.
    if (typeof args.error === "string") return { kind: "refused", content: args.error };

    if (name === "end") {
        const answer = String(args.content ?? "").trim();
        return answer
            ? { kind: "answer", answer }
            : { kind: "refused", content: prompt("end-no-content") };
    }

    if (name === "compact") {
        const summary = String(args.summary ?? "").trim();
        return summary
            ? { kind: "compact", summary }
            : { kind: "refused", content: prompt("compact-no-summary") };
    }

    // A model that reissues the call it just made, having learned nothing in between,
    // will never make progress.
    const signature = `${name}:${JSON.stringify(args)}`;
    if (signature === previous)
        return { kind: "refused", content: prompt("repeat-call", { name }) };

    return { kind: "act", name, args, signature };
}
