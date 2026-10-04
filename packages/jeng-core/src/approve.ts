export type ApprovalKind =
    | "create gadget"
    | "rewrite gadget"
    | "test gadget"
    | "delete gadget"
    | "create protocol"
    | "delete protocol";

export interface Approval {
    kind: ApprovalKind;
    name: string;
    /** The exact bytes at stake: what would land on disk, or what would come off it. */
    source: string;
    /** Why the model wants it. A protocol carries none, being only text. */
    reason: string;
}

export type ApprovalDecision = { approved: true } | { approved: false; reason: string };

export type Approve = (request: Approval) => Promise<ApprovalDecision>;

export type Review = { ok: true } | { ok: false; error: string };

export const isDelete = (kind: ApprovalKind) => kind.startsWith("delete");

// A rejection is the model's result to read, so it goes back as an instruction
// to try again rather than as a bare refusal. A deletion has nothing to change,
// so telling the model to change it would send it off rewriting something that
// was never on the table.
export async function review(approve: Approve, request: Approval): Promise<Review> {
    const decision = await approve(request);
    if (decision.approved) return { ok: true };
    const reason = decision.reason.trim() || "no reason was given";
    const next = isDelete(request.kind)
        ? "Nothing was deleted. Do something else, or say so with end."
        : "Change it and ask again.";
    return {
        ok: false,
        error: `the user rejected ${request.kind} "${request.name}": ${reason}. ${next}`,
    };
}
