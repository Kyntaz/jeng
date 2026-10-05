import { type Answers, fields, type Widget } from "@jeng/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { USER } from "./theme";
import { GadgetView } from "./view";

export function Panel({ widget, onDone }: { widget: Widget; onDone: (answers: Answers) => void }) {
    const asked = useMemo(() => fields(widget), [widget]);
    const [answers, setAnswers] = useState<Answers>({});
    const [focused, setFocused] = useState(asked[0]?.name);

    useKeyboard((key) => {
        if (key.name !== "tab") return;
        const at = asked.findIndex((field) => field.name === focused);
        const step = key.shift ? -1 : 1;
        setFocused(asked[(at + step + asked.length) % asked.length].name);
    });

    // The form is sent as soon as every field has an answer, so a lone question is
    // answered by answering it and no form needs a submit key of its own. Kept off
    // the dependencies because the caller makes a new closure on every render, and
    // that would resend a form that was never touched since the last one.
    const done = useRef(onDone);
    useEffect(() => {
        done.current = onDone;
    }, [onDone]);
    useEffect(() => {
        if (asked.length && asked.every((field) => field.name in answers)) done.current(answers);
    }, [answers, asked]);

    return (
        <box border borderColor={USER} flexDirection="column" paddingX={1} flexShrink={0}>
            <GadgetView
                widget={widget}
                focused={focused}
                onAnswer={(name, value) => {
                    const answered = { ...answers, [name]: value };
                    setAnswers(answered);
                    // The next unanswered field takes the focus, so a form is
                    // walkable in order without reaching for tab at all.
                    setFocused(asked.find((field) => !(field.name in answered))?.name ?? name);
                }}
            />
        </box>
    );
}
