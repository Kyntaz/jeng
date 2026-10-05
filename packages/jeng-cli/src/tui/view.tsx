import type { Widget } from "@jeng/core";
import type { InputRenderable, TextareaRenderable } from "@opentui/core";
import { useRef } from "react";
import { COLORS, choiceList, SELECTION, SYNTAX } from "./theme";

type Drawn = Extract<Widget, { kind: "text" | "markdown" | "code" | "diff" }>;
type Choice = Extract<Widget, { kind: "select" }>;
type Typed = Extract<Widget, { kind: "input" | "textarea" }>;

export interface ViewProps {
    widget: Widget;
    /** Given, the tree is a record of what was answered rather than something live. */
    answers?: Record<string, string>;
    focused?: string;
    onAnswer?: (name: string, value: string) => void;
}

// One renderer for both halves of a gadget's interface, because it is the same tree
// either way and only the leaves at the bottom of it differ.
export function GadgetView(props: ViewProps) {
    const { widget, answers } = props;

    switch (widget.kind) {
        case "box":
            return (
                <box flexDirection={widget.direction === "row" ? "row" : "column"}>
                    {widget.children.map((child, at) => (
                        <GadgetView key={at} {...props} widget={child} />
                    ))}
                </box>
            );
        case "select":
        case "input":
        case "textarea":
            // The question is drawn either way, because a control on its own says
            // nothing about what it is asking.
            return (
                <box flexDirection="column" marginBottom={1} flexGrow={1}>
                    <text
                        fg={COLORS.jeng}
                        selectionBg={SELECTION}
                        wrapMode="word"
                        content={widget.question}
                    />
                    {answers ? (
                        <text
                            fg={widget.name in answers ? COLORS.jeng : COLORS.think}
                            selectionBg={SELECTION}
                            wrapMode="word"
                            content={answers[widget.name] ?? "skipped"}
                        />
                    ) : (
                        <Control {...props} widget={widget} />
                    )}
                </box>
            );
        default:
            return <DrawnWidget widget={widget} />;
    }
}

// Everything a gadget draws is grown into what is left of its line, because a
// widget laid beside another measures against that line's height rather than its
// own and would claim to be one screen tall.
function DrawnWidget({ widget }: { widget: Drawn }) {
    switch (widget.kind) {
        case "markdown":
            return <markdown content={widget.content} syntaxStyle={SYNTAX} flexGrow={1} />;
        case "code":
            return (
                <code
                    content={widget.content}
                    filetype={widget.filetype}
                    syntaxStyle={SYNTAX}
                    flexGrow={1}
                />
            );
        case "diff":
            return (
                <diff
                    diff={widget.diff}
                    filetype={widget.filetype}
                    syntaxStyle={SYNTAX}
                    flexGrow={1}
                />
            );
        default:
            return (
                <text
                    selectionBg={SELECTION}
                    wrapMode="word"
                    content={widget.content}
                    flexGrow={1}
                />
            );
    }
}

function Control({
    widget,
    focused,
    onAnswer,
}: {
    widget: Choice | Typed;
    focused?: string;
    onAnswer?: (name: string, value: string) => void;
}) {
    const line = useRef<InputRenderable>(null);
    const area = useRef<TextareaRenderable>(null);
    const here = focused === widget.name;

    if (widget.kind === "select")
        return (
            <select
                focused={here}
                {...choiceList(widget.options)}
                onSelect={(_at, option) => {
                    if (option) onAnswer?.(widget.name, option.name);
                }}
            />
        );
    if (widget.kind === "input")
        return (
            <input
                ref={line}
                focused={here}
                placeholder={widget.placeholder}
                onSubmit={() => onAnswer?.(widget.name, line.current?.plainText ?? "")}
            />
        );
    return (
        <textarea
            ref={area}
            focused={here}
            height={4}
            placeholder={widget.placeholder}
            onSubmit={() => onAnswer?.(widget.name, area.current?.plainText ?? "")}
        />
    );
}
