import type { Mode } from "@jeng/core";
import { memo } from "react";
import type { Entry } from "./entries";
import { COLORS, color, type Owner, owner, SELECTION } from "./theme";
import { GadgetView } from "./view";

export interface Block {
    owner?: Owner;
    /** The mode the entries in here were produced in, which decides the colour. */
    mode?: Mode;
    entries: Entry[];
}

const modeOf = (entry: Entry) => ("mode" in entry ? entry.mode : undefined);

// A call opens a box of its own, and whatever it returned joins it. Everything else
// carries on in the box it is already in, because one person's turn is one box even
// when it is written in more than one piece.
const calls = (entry: Entry) => entry.kind === "tool" || entry.kind === "approval";

// Blocks are keyed by owner rather than by colour, because an action wears its
// owner's colour. The mode is part of the key as well, because a box that changed
// colour halfway through would claim to be the same conversation.
export function blocks(entries: Entry[]): Block[] {
    const result: Block[] = [];
    for (const entry of entries) {
        const who = owner(entry);
        const mode = modeOf(entry);
        const last = result.at(-1);
        if (who && !calls(entry) && last?.owner === who && last.mode === mode)
            last.entries.push(entry);
        else result.push({ owner: who, mode, entries: [entry] });
    }
    return result;
}

// A box is named after the first entry in it rather than after where it sits, because
// anything that opens or closes a box moves everything below it, and a box handed
// another's place would keep the measurements of the box that used to be there.
const names = new WeakMap<Entry, number>();
let named = 0;

export const nameOf = (block: Block): number => {
    const first = block.entries[0];
    const known = names.get(first);
    if (known !== undefined) return known;
    names.set(first, ++named);
    return named;
};

function Row({ entry }: { entry: Entry }) {
    if (entry.kind === "view") return <GadgetView widget={entry.widget} answers={entry.answers} />;
    if (!("icon" in entry))
        return (
            <text
                fg={COLORS[entry.kind]}
                selectionBg={SELECTION}
                wrapMode="word"
                content={entry.text}
            />
        );
    // The icon is a column of its own, so a wrapped line hangs off what is being
    // written about rather than off the marker in front of it. The gutter on the
    // left of it belongs to the box, so an action lines up with the prose above it.
    return (
        <box flexDirection="row" gap={2}>
            <text fg={COLORS[entry.kind]} content={entry.icon} />
            <text
                fg={COLORS[entry.kind]}
                selectionBg={SELECTION}
                wrapMode="word"
                content={entry.text}
            />
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
            // A box that can be squashed is a box shorter than the text in it, which
            // draws the last line of that text over its own lower border.
            flexShrink={0}
            width="100%"
        >
            {block.entries.map((entry, row) => (
                <Row key={row} entry={entry} />
            ))}
        </box>
    );
});
