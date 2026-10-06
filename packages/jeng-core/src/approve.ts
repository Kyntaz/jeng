import { prompt } from "./prompts";

export type ApprovalKind =
    | "create gadget"
    | "rewrite gadget"
    | "test gadget"
    | "delete gadget"
    | "create protocol"
    | "rewrite protocol"
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

export const isDelete = (kind: ApprovalKind) => kind.startsWith("delete");

/** Answers in the shape an action answers in, so a refusal needs no translating on the way back. */
export async function review(
    approve: Approve,
    request: Approval,
): Promise<{ ok: boolean; content: string }> {
    const decision = await approve(request);
    if (decision.approved) return { ok: true, content: "" };
    return {
        ok: false,
        content: prompt(isDelete(request.kind) ? "rejected-delete" : "rejected-change", {
            kind: request.kind,
            name: request.name,
            reason: decision.reason.trim() || "no reason was given",
        }),
    };
}
