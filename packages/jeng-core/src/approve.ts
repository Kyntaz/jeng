export interface Approval {
    kind: "gadget" | "protocol";
    name: string;
    /** The exact bytes that would land on disk, so the review sees the real thing. */
    source: string;
    /** Why the model wants it. A protocol carries none, being only text. */
    reason: string;
    /** Whether this would replace something the user has already approved. */
    replacing: boolean;
}

export type ApprovalDecision = { approved: true } | { approved: false; reason: string };

export type Approve = (request: Approval) => Promise<ApprovalDecision>;

export type Review = { ok: true } | { ok: false; error: string };

// A rejection is the model's result to read, so it goes back as an instruction
// to try again rather than as a bare refusal.
export async function review(approve: Approve, request: Approval): Promise<Review> {
    const decision = await approve(request);
    if (decision.approved) return { ok: true };
    const reason = decision.reason.trim() || "no reason was given";
    return {
        ok: false,
        error: `the user rejected ${request.kind} "${request.name}": ${reason}. Change it and ask again.`,
    };
}
