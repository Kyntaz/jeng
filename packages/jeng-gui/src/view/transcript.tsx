import type { Ask } from "@jeng/view";
// Reached past the barrel, because the window has no business loading the agent that
// the conversation is a view of: `@jeng/view` is where the node half of jeng starts.
import { blank, type Entry, isAsk, QUIET } from "@jeng/view/transcript";
import { Fragment } from "react";
import { Gadget } from "./gadget";

// Named by identity rather than by position, because anything that opens or closes a
// card moves everything below it.
const revisions = new WeakMap<Entry, number>();
let named = 0;

const revisionOf = (entry: Entry): number => {
    const known = revisions.get(entry);
    if (known !== undefined) return known;
    revisions.set(entry, ++named);
    return named;
};

export interface TranscriptProps {
    entries: Entry[];
    asks: Ask[];
    thinking: boolean;
    onAnswer: (id: number, answers: Record<string, unknown>) => void;
    onAbandon: (id: number) => void;
}

/**
 * The record of the conversation. A form is drawn here rather than in a panel of its
 * own, because a window has room for it: live while it is open, and again carrying what
 * it was given once it has been, which is what a widget tree does with a widget.
 */
export function Transcript({ entries, asks, thinking, onAnswer, onAbandon }: TranscriptProps) {
    const visible = entries.filter(
        (entry) => thinking || (!QUIET.includes(entry.kind) && !blank(entry)),
    );

    return visible.map((entry) => (
        <Fragment key={revisionOf(entry)}>
            <Turn entry={entry} asks={asks} onAnswer={onAnswer} onAbandon={onAbandon} />
        </Fragment>
    ));
}

interface TurnProps extends Omit<TranscriptProps, "entries" | "thinking"> {
    entry: Entry;
}

function Turn({ entry, asks, onAnswer, onAbandon }: TurnProps) {
    switch (entry.kind) {
        case "user":
            return (
                <div className="turn">
                    <div className="speech user">{entry.text}</div>
                </div>
            );
        case "jeng":
            return (
                <div className="turn">
                    <div className="speech">{entry.text}</div>
                </div>
            );
        case "think":
            return (
                <div className="turn">
                    <div className="speech think">{entry.text}</div>
                </div>
            );
        case "tool":
        case "output":
        case "failure":
            return (
                <div className="turn">
                    <div className={entry.kind === "failure" ? "call failed" : "call"}>
                        <span>{entry.icon}</span>
                        <span className="note">{entry.text}</span>
                    </div>
                </div>
            );
        case "error":
            return (
                <div className="turn">
                    <div className="note failed">
                        {entry.icon} {entry.text}
                    </div>
                </div>
            );
        case "approval":
            return (
                <div className="turn">
                    <div className="what">
                        <span>⚑</span>
                        <span>
                            {entry.approval.kind} <code>{entry.approval.name}</code>
                        </span>
                    </div>
                    {entry.approval.reason && (
                        <div className="note">why: {entry.approval.reason}</div>
                    )}
                    <pre className="card">{entry.approval.source}</pre>
                </div>
            );
        case "view": {
            // A widget tree belongs to the terminal, and a run here would never have
            // been offered one, so anything else says so rather than nothing.
            if (entry.draw.surface !== "gui")
                return (
                    <div className="turn">
                        <div className="note">an interface for the terminal</div>
                    </div>
                );
            const open = asks.find((ask) => isAsk(entry, ask));
            return (
                <div className="turn">
                    <Gadget
                        file={entry.draw.file}
                        props={entry.draw.props}
                        answers={entry.answers}
                        revision={revisionOf(entry)}
                        onAnswer={open ? (answers) => onAnswer(open.id, answers) : undefined}
                        onAbandon={open ? () => onAbandon(open.id) : undefined}
                    />
                </div>
            );
        }
    }
}
