import type { Approval } from "@jeng/core";

// The whole source goes in, because the point is that the user reads what they are
// being asked to allow rather than a summary of it.
export function approvalText(request: Approval): string {
    return [
        `${request.kind} \`${request.name}\``,
        ...(request.reason ? [`why: ${request.reason}`] : []),
        "",
        request.source,
    ].join("\n");
}
