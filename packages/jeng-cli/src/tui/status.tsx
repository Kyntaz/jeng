import { relative } from "node:path";
import type { Mode } from "@jeng/core";
import type { ReactNode } from "react";
import { BORDER, MODE_COLOR, MUTED } from "./theme";

export const compact = (tokens: number) =>
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);

// A file the cwd walk found is only ever the cwd itself or one of its parents, so
// only the cwd is worth shortening; a home elsewhere has to say where it is.
function place(dir: string, cwd: string): string {
    const closer = relative(cwd, dir);
    if (closer === "") return ".";
    return closer.startsWith("..") ? dir : closer;
}

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
// the scroll region is the only one that gives up rows.
function Bar({ children, mode }: { children: ReactNode[]; mode?: Mode }) {
    return (
        <box
            flexDirection="row"
            flexWrap="no-wrap"
            gap={2}
            paddingLeft={1}
            backgroundColor={mode ? MODE_COLOR[mode] : undefined}
        >
            {children}
        </box>
    );
}

export function Header({
    homes,
    model,
    tokens,
    mode,
}: {
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
            <text fg={MUTED} wrapMode="none" content={homes.join(", ")} />
            <text fg={MUTED} wrapMode="none" content={`ctx ${compact(tokens)}`} />
        </Bar>
    );
}

export function Footer({
    busy,
    showThinking,
    spinner,
    waiting,
}: {
    busy: boolean;
    showThinking: boolean;
    spinner: string;
    /** Something of Jeng's is waiting on a human, whatever asked and whatever for. */
    waiting?: { enter: string; other: string };
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
            <text fg={MUTED} wrapMode="none" content="ctrl+esc quit" />
            <text fg={MUTED} wrapMode="none" content="ctrl+l clear" />
            <text fg={MUTED} wrapMode="none" content="esc interrupt" />
            <text fg={showThinking ? BORDER : MUTED} wrapMode="none" content="ctrl+r detail" />
            <text fg={MUTED} wrapMode="none" content="tab mode" />
            {busy && <text fg={BORDER} wrapMode="none" content={`${spinner} thinking`} />}
        </Bar>
    );
}
