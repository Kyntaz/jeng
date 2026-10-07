import type { Mode } from "@jeng/core";
import { compact, place } from "@jeng/view";
import type { ReactNode } from "react";
import { BORDER, MODE_COLOR, MUTED } from "./theme";

// Every key the footer is allowed to say, in pages that each fit one line beside the
// spinner, because a line of keys that has to be clipped is a line of keys nobody reads.
export const PAGES = [
    ["ctrl+esc quit", "ctrl+l clear", "esc interrupt", "tab mode"],
    ["ctrl+r detail", "ctrl+p sessions"],
    ["pageup/pgdn scroll", "ctrl+end latest"],
];

/** The one hint that is lit rather than muted, because it is the one saying what is showing. */
const DETAIL = PAGES[1][0];

export function Instructions({ agents, cwd }: { agents: string[]; cwd: string }) {
    if (!agents.length) return null;
    return (
        <box flexDirection="column" paddingLeft={2} marginBottom={1}>
            {agents.map((dir) => (
                <text
                    key={dir}
                    fg={MUTED}
                    wrapMode="word"
                    content={`▪ ${place(dir, cwd)}/AGENTS.md`}
                />
            ))}
        </box>
    );
}

// The header and footer stay on one line however narrow the terminal gets, so
// the scroll region is the only one that gives up rows. A bar is as wide as the
// terminal, which is what lets what is at the end of it stay at the end.
function Bar({ children, mode }: { children: ReactNode[]; mode?: Mode }) {
    return (
        <box
            flexDirection="row"
            flexWrap="no-wrap"
            gap={2}
            paddingLeft={1}
            width="100%"
            backgroundColor={mode ? MODE_COLOR[mode] : undefined}
        >
            {children}
        </box>
    );
}

export function Header({
    cwd,
    homes,
    model,
    tokens,
    mode,
}: {
    cwd: string;
    homes: string[];
    model: string;
    tokens: number;
    mode: Mode;
}) {
    // The header wears the mode rather than the word naming it, because it is
    // also what has to cover the transcript row it is laid over.
    return (
        <Bar mode={mode}>
            <text fg={MUTED} wrapMode="none" content={`jeng ${model}`} />
            <text fg={MUTED} wrapMode="none" content={mode} />
            <text fg={MUTED} wrapMode="none" content={cwd} />
            <text
                fg={MUTED}
                wrapMode="none"
                content={homes.map((home) => place(home, cwd)).join(", ")}
            />
            <text fg={MUTED} wrapMode="none" content={`ctx ${compact(tokens)}`} />
        </Bar>
    );
}

export function Footer({
    busy,
    showThinking,
    spinner,
    waiting,
    page,
}: {
    busy: boolean;
    showThinking: boolean;
    spinner: string;
    /** Something of Jeng's is waiting on a human, whatever asked and whatever for. */
    waiting?: { enter: string; other: string };
    /** Which page of keys is showing, of `PAGES`. */
    page: number;
}) {
    // A waiting turn replaces the keys rather than joining them, because it is the
    // only thing the user can act on until they answer it.
    if (waiting)
        return (
            <Bar>
                <text fg={BORDER} wrapMode="none" content={waiting.enter} />
                <text fg={MUTED} wrapMode="none" content={waiting.other} />
            </Bar>
        );

    return (
        <Bar>
            {/* The page is the only thing here that may be short of room, so a terminal
                too narrow for the line loses keys rather than the spinner or the counter. */}
            <box flexDirection="row" flexShrink={1} gap={2} overflow="hidden">
                {PAGES[page].map((hint) => (
                    <text
                        key={hint}
                        fg={hint === DETAIL && showThinking ? BORDER : MUTED}
                        wrapMode="none"
                        content={hint}
                    />
                ))}
            </box>
            {busy && <text fg={BORDER} wrapMode="none" content={`${spinner} thinking`} />}
            <text fg={MUTED} wrapMode="none" content={`ctrl+g ${page + 1}/${PAGES.length}`} />
        </Bar>
    );
}
