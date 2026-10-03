import { memo } from "react";
import type { Entry } from "./entries";
import { BORDER, COLORS, GUTTERS, OWNER } from "./theme";
import { GadgetView } from "./view";

export interface Block {
    border?: string;
    entries: Entry[];
}

export function blocks(entries: Entry[]): Block[] {
    const result: Block[] = [];
    for (const entry of entries) {
        const owner = OWNER[entry.kind];
        const border = owner ? BORDER[owner] : undefined;
        const last = result.at(-1);
        if (border && last?.border === border) last.entries.push(entry);
        else result.push({ border, entries: [entry] });
    }
    return result;
}

function Row({ entry }: { entry: Entry }) {
    if (entry.kind === "view") return <GadgetView widget={entry.widget} answers={entry.answers} />;
    if (entry.kind !== "error")
        return <text fg={COLORS[entry.kind]} wrapMode="word" content={entry.text} />;
    return (
        <box flexDirection="row" gap={1} paddingLeft={1}>
            <text fg={COLORS.error} content={GUTTERS.error} />
            <text fg={COLORS.error} wrapMode="word" content={entry.text} />
        </box>
    );
}

// Memoized so the spinner tick and incoming tokens don't re-measure the whole
// history on every frame; blocks keep their identity while entries is untouched.
export const BlockView = memo(function BlockView({ block }: { block: Block }) {
    return (
        <box
            border={Boolean(block.border)}
            borderColor={block.border}
            flexDirection="column"
            paddingLeft={1}
            marginBottom={block.border ? 1 : 0}
        >
            {block.entries.map((entry, row) => (
                <Row key={row} entry={entry} />
            ))}
        </box>
    );
});
