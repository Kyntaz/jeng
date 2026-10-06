import type { SessionRef } from "@jeng/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";
import { BORDER, MUTED, USER } from "./theme";

// How many rows a list may take, because a picker taller than the transcript behind it is
// a picker that hides what it is picking out of.
const ROWS = 8;

/**
 * What this home has written down, newest first, and the one key that opens a conversation
 * rather than reading one. A session is named by when it happened, so the list is read by
 * time backwards and the title is the only thing worth a column.
 */
export function SessionPicker({
    sessions,
    refused,
    onPick,
    onClose,
}: {
    sessions: SessionRef[];
    /** A session that was named and could not be opened, said where it was asked for. */
    refused?: string;
    onPick: (id: string) => void;
    onClose: () => void;
}) {
    const [at, setAt] = useState(0);
    const last = sessions.length - 1;
    // A session deleted between the list being read and it being picked leaves the
    // highlight pointing at nothing, and a list being read is empty for a moment, so the
    // row it names is held to whatever is actually there.
    const held = (row: number) => Math.min(Math.max(0, row), Math.max(0, last));

    useEffect(() => setAt(held), [last]);

    useKeyboard((key) => {
        if (key.name === "escape") return onClose();
        if (key.name === "up") return setAt(held(at - 1));
        if (key.name === "down") return setAt(held(at + 1));
        if (key.name !== "return" && key.name !== "kpenter") return;
        const picked = sessions[at];
        if (picked) onPick(picked.id);
    });

    // The rows follow the highlight rather than the list, so a long list scrolls behind a
    // fixed box instead of pushing the prompt off the screen.
    const from = Math.max(0, Math.min(at - ROWS + 1, last - ROWS + 1));

    return (
        <box border borderColor={BORDER} flexDirection="column" flexShrink={0} paddingX={1}>
            <text fg={MUTED} wrapMode="none" content={heading(sessions.length)} />
            {sessions.slice(from, from + ROWS).map((session, row) => (
                <text
                    key={session.id}
                    fg={from + row === at ? USER : MUTED}
                    wrapMode="none"
                    content={`${session.id}  ${session.title || "nothing said yet"}`}
                />
            ))}
            {refused && <text fg="#e06c75" wrapMode="word" content={refused} />}
        </box>
    );
}

const heading = (count: number): string =>
    count === 0 ? "no sessions yet" : `${count} session${count === 1 ? "" : "s"}`;
