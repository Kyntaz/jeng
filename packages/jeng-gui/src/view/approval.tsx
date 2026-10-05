import type { Approval } from "@jeng/core";
import { useState } from "react";

/**
 * An approval is answered where it is asked rather than in a bar that took the prompt's
 * place, so what is being allowed stays on screen next to the two ways out of it.
 */
export function ApprovalCard({
    approval,
    onDecide,
}: {
    approval: Approval;
    onDecide: (decision: { approved: true } | { approved: false; reason: string }) => void;
}) {
    const [reason, setReason] = useState("");

    return (
        <div className="approval">
            <div className="what">
                <span>⚑</span>
                <span>
                    {approval.kind} <code>{approval.name}</code>
                </span>
            </div>
            <pre>{approval.source}</pre>
            <textarea
                value={reason}
                placeholder="why not, if you are turning it down"
                onChange={(event) => setReason(event.target.value)}
            />
            <div className="actions">
                <button type="button" className="yes" onClick={() => onDecide({ approved: true })}>
                    approve
                </button>
                <button
                    type="button"
                    className="no"
                    // A turn-down never waits on an explanation, so the reason is taken
                    // whether or not one was written.
                    onClick={() => onDecide({ approved: false, reason: reason.trim() })}
                >
                    reject
                </button>
            </div>
        </div>
    );
}
