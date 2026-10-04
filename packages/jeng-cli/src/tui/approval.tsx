import type { ApprovalDecision } from "@jeng/core";
import type { InputRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useRef, useState } from "react";
import { BORDER, MUTED } from "./theme";

const YES = "#98c379";
const NO = "#e06c75";
const STOPS = ["approve", "reason", "reject"] as const;

export function ApprovalBar({ onDecide }: { onDecide: (decision: ApprovalDecision) => void }) {
    const reason = useRef<InputRenderable>(null);
    const [stop, setStop] = useState<(typeof STOPS)[number]>("approve");

    useKeyboard((key) => {
        if (key.name === "tab") {
            const at = STOPS.indexOf(stop);
            setStop(STOPS[(at + (key.shift ? -1 : 1) + STOPS.length) % STOPS.length]);
            return;
        }
        if (key.name !== "return" && key.name !== "kpenter") return;
        // The reason belongs to the reject button whether or not one was written,
        // so a turn-down is never held up waiting for an explanation.
        if (stop === "approve") onDecide({ approved: true });
        else onDecide({ approved: false, reason: reason.current?.value.trim() ?? "" });
    });

    return (
        <box
            border
            borderColor={BORDER}
            flexDirection="row"
            alignItems="center"
            gap={2}
            paddingX={1}
            flexShrink={0}
        >
            <Button label="approve" focused={stop === "approve"} color={YES} />
            {/* A renderable measures to its own text and does not shrink, so a long
                reason would otherwise push the reject button off the end of the bar.
                The reason is what may give up room; the buttons are the way out of
                the decision and have to stay where they are. */}
            <input
                ref={reason}
                focused={stop === "reason"}
                flexGrow={1}
                flexShrink={1}
                minWidth={0}
            />
            <Button label="reject" focused={stop === "reject"} color={NO} />
        </box>
    );
}

function Button({ label, focused, color }: { label: string; focused: boolean; color: string }) {
    return (
        <box border borderColor={focused ? color : MUTED} flexShrink={0}>
            <text fg={focused ? color : MUTED} content={` ${label} `} />
        </box>
    );
}
