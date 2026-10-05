import type { ApprovalDecision } from "@jeng/core";
import type { TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef, useState } from "react";
import { useGrowing } from "./prompt";
import { BORDER, MUTED, SELECTION, USER } from "./theme";

const YES = USER;
const NO = "#e06c75";

// Down the bar in the order the eye reads it: the two ways out of the decision
// first, and what is written into the turn-down underneath them.
const STOPS = ["approve", "reject", "reason"] as const;

const SHARE = 3;

export function ApprovalBar({ onDecide }: { onDecide: (decision: ApprovalDecision) => void }) {
    const reason = useRef<TextareaRenderable>(null);
    const [stop, setStop] = useState<(typeof STOPS)[number]>("approve");
    const growing = useGrowing(reason, SHARE);

    useKeyboard((key) => {
        if (key.name === "tab") {
            const at = STOPS.indexOf(stop);
            setStop(STOPS[(at + (key.shift ? -1 : 1) + STOPS.length) % STOPS.length]);
            return;
        }
        if (key.name !== "return" && key.name !== "kpenter") return;
        // Only a button decides. Enter in the box is a line break, and the box is
        // where a reason gets written, so a keystroke that lands here while the box
        // holds the keys belongs to the box rather than to the decision.
        if (stop === "approve") onDecide({ approved: true });
        // A turn-down never waits on an explanation, so the reason is taken whether
        // or not one was written.
        else if (stop === "reject")
            onDecide({ approved: false, reason: reason.current?.plainText.trim() ?? "" });
    });

    return (
        <box flexDirection="column" flexShrink={0}>
            <Button label="approve" focused={stop === "approve"} color={YES} />
            <Button label="reject" focused={stop === "reject"} color={NO} />
            {/* The reason is a box rather than a row because turning something down is
                the one answer worth more than a line. */}
            <box border borderColor={stop === "reason" ? NO : BORDER} paddingX={1} flexShrink={0}>
                <textarea
                    ref={reason}
                    focused={stop === "reason"}
                    wrapMode="word"
                    selectionBg={SELECTION}
                    {...growing}
                />
            </box>
        </box>
    );
}

function Button({ label, focused, color }: { label: string; focused: boolean; color: string }) {
    return (
        <box border borderColor={focused ? color : MUTED} width="100%" flexShrink={0}>
            <text fg={focused ? color : MUTED} content={label} flexGrow={1} textAlign="center" />
        </box>
    );
}
