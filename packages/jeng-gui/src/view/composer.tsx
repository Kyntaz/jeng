import { useEffect, useRef, useState } from "react";

/**
 * The prompt. Enter sends and Shift+Enter breaks a line, and a box that grows is a box
 * that can be read while it is being written to. It stays usable while Jeng works, so
 * anything typed mid-turn reaches the model between two of its calls.
 */
export function Composer({
    onSend,
    onInterrupt,
    busy,
    holding,
}: {
    onSend: (text: string) => void;
    onInterrupt: () => void;
    busy: boolean;
    /** True while a form or an approval is up, which is what escape reaches for. */
    holding: boolean;
}) {
    const [text, setText] = useState("");
    const box = useRef<HTMLTextAreaElement>(null);

    // The box keeps its place while Jeng works, so what was half typed is still there.
    useEffect(() => {
        const element = box.current;
        if (!element) return;
        element.style.height = "auto";
        element.style.height = `${element.scrollHeight}px`;
    }, [text]);

    const submit = () => {
        if (!text.trim()) return;
        onSend(text);
        setText("");
    };

    return (
        <div className="composer">
            <textarea
                ref={box}
                value={text}
                placeholder={holding ? "answer what is on screen above" : "ask jeng something"}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey) return;
                    event.preventDefault();
                    submit();
                }}
            />
            {busy ? (
                <button type="button" className="no" onClick={onInterrupt}>
                    stop
                </button>
            ) : (
                <button type="button" className="send" onClick={submit}>
                    send
                </button>
            )}
        </div>
    );
}
