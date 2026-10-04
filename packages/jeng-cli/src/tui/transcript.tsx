import type { Mode } from "@jeng/core";
import { memo } from "react";
import type { Entry } from "./entries";
import { COLORS, color, type Owner, owner } from "./theme";
import { GadgetView } from "./view";

export interface Block {
    owner?: Owner;
    /** The mode the entries in here were produced in, which decides the colour. */
    mode?: Mode;
    entries: Entry[];
}

const modeOf = (entry: Entry) => ("mode" in entry ? entry.mode : undefined);

// Blocks are keyed by owner rather than by colour, because an action shares its
// owner's box. The mode is part of the key as well, because a box that changed
// colour halfway through would claim to be the same conversation.
export function blocks(entries: Entry[]): Block[] {
    const result: Block[] = [];
    for (const entry of entries) {
        const who = owner(entry);
        const mode = modeOf(entry);
        const last = result.at(-1);
        if (who && last?.owner === who && last.mode === mode) last.entries.push(entry);
        else result.push({ owner: who, mode, entries: [entry] });
    }
    return result;
}

function Row({ entry }: { entry: Entry }) {
    if (entry.kind === "view") return <GadgetView widget={entry.widget} answers={entry.answers} />;
    if (!("icon" in entry))
        return <text fg={COLORS[entry.kind]} wrapMode="word" content={entry.text} />;
    // The icon is a column of its own, so a wrapped line hangs off what is being
    // written about rather than off the marker in front of it. The gutter on the
    // left of it belongs to the box, so an action lines up with the prose above it.
    return (
        <box flexDirection="row" gap={2}>
            <text fg={COLORS[entry.kind]} content={entry.icon} />
            <text fg={COLORS[entry.kind]} wrapMode="word" content={entry.text} />
        </box>
    );
}

// Memoized so the spinner tick and incoming tokens don't re-measure the whole
// history on every frame; blocks keep their identity while entries is untouched.
export const BlockView = memo(function BlockView({ block }: { block: Block }) {
    const border = block.owner ? color(block.owner, block.mode) : undefined;
    return (
        <box
            border={Boolean(border)}
            borderColor={border}
            flexDirection="column"
            paddingX={1}
            marginBottom={border ? 1 : 0}
        >
            {block.entries.map((entry, row) => (
                <Row key={row} entry={entry} />
            ))}
        </box>
    );
});
