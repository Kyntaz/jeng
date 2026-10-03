import type { KeyBinding, TextareaRenderable } from "@opentui/core";
import type { RefObject } from "react";

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
    placeholder = "enter to send, shift+enter for a new line",
}: {
    input: RefObject<TextareaRenderable | null>;
    onSubmit: () => void;
    placeholder?: string;
}) {
    return (
        <box border paddingLeft={1} flexShrink={0}>
            {/* The hint lives in the box rather than the footer because it is
                only meaningful while the box is still empty. */}
            <textarea
                ref={input}
                focused
                wrapMode="word"
                height={4}
                keyBindings={PROMPT_KEYS}
                placeholder={placeholder}
                onSubmit={onSubmit}
            />
        </box>
    );
}
