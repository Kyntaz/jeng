import { blank, type Entry, isAsk, type Pending, QUIET } from "@jeng/view";
import { Code } from "./code";
import { Gadget } from "./gadget";

interface TranscriptProps {
    entries: Entry[];
    asks: Pending[];
    thinking: boolean;
    /** The approval being answered right now, which the card below already draws. */
    approving?: number;
    onAnswer: (id: number, answers: Record<string, unknown>) => void;
    onAbandon: (id: number) => void;
}

/**
 * The record of the conversation. A form is drawn here rather than in a panel of its
 * own, because a window has room for it: live while it is open, and again carrying what
 * it was given once it has been, which is what a widget tree does with a widget.
 *
 * Every row is named by the number it was given, because this is a window reading its
 * state as JSON, where being the same object stops meaning anything. Naming rows by the
 * object holding them would rebuild the whole scroll on every word the model says, which
 * is not only slow: it is what takes a gadget down and puts it back up while the user is
 * in the middle of filling one in.
 */
export function Transcript({
    entries,
    asks,
    thinking,
    approving,
    onAnswer,
    onAbandon,
}: TranscriptProps) {
    const visible = entries.filter(
        (entry) =>
            // The live card already shows the approval being answered, and it shows it
            // better: the transcript's copy has no way to answer it. It stays here the
            // moment it is decided, which is when it becomes the record it was left to be.
            !(approving !== undefined && entry.kind === "approval" && entry.id === approving) &&
            (thinking || (!QUIET.includes(entry.kind) && !blank(entry))),
    );

    return visible.map((entry) => (
        <Turn key={entry.id} entry={entry} asks={asks} onAnswer={onAnswer} onAbandon={onAbandon} />
    ));
}

interface TurnProps extends Omit<TranscriptProps, "entries" | "thinking"> {
    entry: Entry;
}

function Turn(props: TurnProps) {
    return <div className="turn">{body(props)}</div>;
}

/** What one line says. Every kind is a turn, so the wrapper belongs to one place. */
function body({ entry, asks, onAnswer, onAbandon }: TurnProps) {
    switch (entry.kind) {
        case "user":
            return <div className="speech user">{entry.text}</div>;
        case "jeng":
            return <div className="speech">{entry.text}</div>;
        case "think":
            return <div className="speech think">{entry.text}</div>;
        case "tool":
        case "output":
        case "failure":
            return (
                <div className={entry.kind === "failure" ? "call failed" : "call"}>
                    <span>{entry.icon}</span>
                    <span className="note">{entry.text}</span>
                </div>
            );
        case "error":
            return (
                <div className="note failed">
                    {entry.icon} {entry.text}
                </div>
            );
        case "approval":
            return (
                <>
                    <div className="what">
                        <span>⚑</span>
                        <span>
                            {entry.approval.kind} <code>{entry.approval.name}</code>
                        </span>
                    </div>
                    {entry.approval.reason && (
                        <div className="note">why: {entry.approval.reason}</div>
                    )}
                    <Code code={entry.approval.source} />
                </>
            );
        case "view": {
            // A widget tree belongs to the terminal, and a run here would never have
            // been offered one, so anything else says so rather than nothing.
            if (entry.draw.surface !== "gui")
                return <div className="note">an interface for the terminal</div>;
            const open = asks.find((ask) => isAsk(entry, ask));
            return (
                <Gadget
                    file={entry.draw.file}
                    props={entry.draw.props}
                    answers={entry.answers}
                    revision={entry.draw.id}
                    onAnswer={open ? (answers) => onAnswer(open.id, answers) : undefined}
                    onAbandon={open ? () => onAbandon(open.id) : undefined}
                />
            );
        }
    }
}
