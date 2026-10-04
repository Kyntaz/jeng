import { BORDER, MUTED } from "./theme";

export const compact = (tokens: number) =>
    tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);

export function Header({ homes, tokens }: { homes: string[]; tokens: number }) {
    // The header and footer stay on one line however narrow the terminal gets,
    // so the scroll region is the only one that gives up rows.
    return (
        <box flexDirection="row" flexWrap="no-wrap" gap={2} paddingLeft={1}>
            <text fg={BORDER.jeng} wrapMode="none" content="jeng" />
            <text fg={MUTED} wrapMode="none" content={homes.join(", ")} />
            <text fg={MUTED} wrapMode="none" content={`ctx ${compact(tokens)}`} />
        </box>
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
            <box flexDirection="row" flexWrap="no-wrap" gap={2} paddingLeft={1}>
                <text fg={BORDER.jeng} wrapMode="none" content={waiting.enter} />
                <text fg={MUTED} wrapMode="none" content={waiting.other} />
            </box>
        );

    return (
        <box flexDirection="row" flexWrap="no-wrap" gap={2} paddingLeft={1}>
            <text fg={MUTED} wrapMode="none" content="ctrl+esc quit" />
            <text fg={MUTED} wrapMode="none" content="ctrl+l clear" />
            <text fg={MUTED} wrapMode="none" content="esc interrupt" />
            <text
                fg={showThinking ? BORDER.jeng : MUTED}
                wrapMode="none"
                content="ctrl+r thinking"
            />
            {busy && <text fg={BORDER.jeng} wrapMode="none" content={`${spinner} thinking`} />}
        </box>
    );
}
