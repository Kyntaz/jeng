import { memo } from "react";
import type { Entry } from "./entries";
import { BORDER, COLORS, OWNER } from "./theme";
import { GadgetView } from "./view";

export interface Block {
    owner?: keyof typeof BORDER;
    entries: Entry[];
}

// Blocks are keyed by owner rather than by colour, because an action shares Jeng's
// gold and is still a box of its own.
export function blocks(entries: Entry[]): Block[] {
    const result: Block[] = [];
    for (const entry of entries) {
        const owner = OWNER[entry.kind];
        const last = result.at(-1);
        if (owner && last?.owner === owner) last.entries.push(entry);
        else result.push({ owner, entries: [entry] });
    }
    return result;
}

function Row({ entry }: { entry: Entry }) {
    if (entry.kind === "view") return <GadgetView widget={entry.widget} answers={entry.answers} />;
    if (!("icon" in entry))
        return <text fg={COLORS[entry.kind]} wrapMode="word" content={entry.text} />;
    // The icon is a column of its own, so a wrapped line hangs off what is being
    // written about rather than off the marker in front of it.
    return (
        <box flexDirection="row" gap={2} paddingLeft={1}>
            <text fg={COLORS[entry.kind]} content={entry.icon} />
            <text fg={COLORS[entry.kind]} wrapMode="word" content={entry.text} />
        </box>
    );
}

// Memoized so the spinner tick and incoming tokens don't re-measure the whole
// history on every frame; blocks keep their identity while entries is untouched.
export const BlockView = memo(function BlockView({ block }: { block: Block }) {
    const border = block.owner ? BORDER[block.owner] : undefined;
    return (
        <box
            border={Boolean(border)}
            borderColor={border}
            flexDirection="column"
            paddingLeft={1}
            marginBottom={border ? 1 : 0}
        >
            {block.entries.map((entry, row) => (
                <Row key={row} entry={entry} />
            ))}
        </box>
    );
});
