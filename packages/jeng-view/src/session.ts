import type { Memory, Message, Mode, Recorded } from "@jeng/core";
import type { Entry } from "./transcript";

/**
 * Everything it takes to be the same conversation again, in two halves that have to travel
 * together: what the model was told, and what the user can read back. The system prompt is
 * in neither, because it is rebuilt every turn out of the homes, the `AGENTS.md` files and
 * the memory — which is why memory is here and a prompt is not.
 */
export interface Session extends Recorded {
    cwd: string;
    homes: string[];
    /** The config file behind the homes and the model, or none when the environment was. */
    config?: string;
    mode: Mode;
    thinking: boolean;
    /** One request old, which is what the header counts out of. */
    tokens: number;
    history: Message[];
    memory: Memory[];
    entries: Entry[];
}

/**
 * Where a conversation is written down. Which home a session belongs to is the host's,
 * because only it knows where files go; when one is worth writing is the conversation's,
 * because it is the only thing that knows what a turn was.
 */
export interface Sessioning {
    /** The conversation to pick up rather than start from nothing. */
    resume?: Session;
    /** A name for a conversation that has none yet: once to begin with, and again after a clear. */
    name: () => string;
    /** Called whenever the conversation is worth writing down. */
    save: (session: Session) => void;
}

/**
 * A session is read rather than searched, so it says what it is about: the first thing that
 * was asked of it, on one line. A one-shot prints its transcript to stdout rather than
 * showing one, so it has the asking in its history and nowhere else.
 */
export function titled(entries: Entry[], history: Message[]): string {
    const asked =
        entries.find((entry) => entry.kind === "user")?.text ??
        history.find((message) => message.role === "user")?.content ??
        "";
    return asked.trim().split("\n")[0].slice(0, 72);
}
