import type { Mode } from "@jeng/core";
import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { type RefObject, useState } from "react";
import { MODE_COLOR, MODE_TINT, SELECTION } from "./theme";

// Sending a prompt stays a single key, so Enter submits and Shift+Enter is what
// breaks a line. Bindings merge over the defaults, so only the differences need
// naming.
export const PROMPT_KEYS: KeyBinding[] = [
    { name: "return", action: "submit" },
    { name: "kpenter", action: "submit" },
    { name: "linefeed", action: "submit" },
    { name: "return", shift: true, action: "newline" },
    { name: "kpenter", shift: true, action: "newline" },
];

// Half the screen is as much of the prompt as may take it, because the transcript
// above is what the answer is read in.
const SHARE = 2;

// `virtualLineCount` only counts the rows that are currently laid out, so a box
// one row tall would never learn how tall it wants to be. This is the whole of it,
// wrapped the way the box is wrapping it.
const rowsOf = (input: RefObject<TextareaRenderable | null>): number =>
    input.current?.editorView.getTotalVirtualLineCount() ?? 1;

export function PromptInput({
    input,
    onSubmit,
    mode,
    focused = true,
    visible = true,
}: {
    input: RefObject<TextareaRenderable | null>;
    onSubmit: () => void;
    /** The box is the one thing on screen that always says which mode this is. */
    mode: Mode;
    // A gadget's interface holds the keys while it is up, so the prompt gives them
    // up rather than competing for the same keystroke.
    focused?: boolean;
    // An approval takes the box's place rather than its life, so what was half
    // typed while Jeng worked is still there once the answer is in.
    visible?: boolean;
}) {
    // The box is as tall as what is in it, so a prompt can be read while it is
    // being written rather than scrolled inside a row that cannot show it.
    const [rows, setRows] = useState(1);
    const { height } = useTerminalDimensions();

    return (
        <box
            border
            borderStyle="heavy"
            borderColor={MODE_COLOR[mode]}
            backgroundColor={MODE_TINT[mode]}
            visible={visible}
            paddingX={1}
            flexShrink={0}
        >
            <textarea
                ref={input}
                focused={focused}
                wrapMode="word"
                selectionBg={SELECTION}
                height={Math.min(rows, Math.max(1, Math.floor(height / SHARE)))}
                keyBindings={PROMPT_KEYS}
                onContentChange={() => setRows(rowsOf(input))}
                onSubmit={onSubmit}
            />
        </box>
    );
}
