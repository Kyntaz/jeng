import type { Mode } from "@jeng/core";
import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import type { RefObject } from "react";
import { MODE_COLOR, MODE_TINT } from "./theme";

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
                height={4}
                keyBindings={PROMPT_KEYS}
                onSubmit={onSubmit}
            />
        </box>
    );
}
