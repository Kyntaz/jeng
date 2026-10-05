import { useEffect, useRef, useState } from "react";

/** What a compiled gadget hands back: something to mount, and how to take it down. */
type Mount = (element: HTMLElement, props: Record<string, unknown>) => () => void;

/**
 * A gadget's component, mounted from a module compiled when the window asked for it.
 *
 * The chunk carries its own react, so the component is given its own root rather than
 * becoming part of this one: two copies of react must never share a tree. It is
 * mounted twice over the life of a form, once live with an `answer` to call and once as
 * a record carrying what it was given, which is what a widget tree does with a widget.
 *
 * Styling needs nothing: the variables the language describes are on the document, and
 * a component mounted into it inherits them like anything else on the page.
 */
export function Gadget({
    file,
    props,
    answers,
    revision,
    onAnswer,
    onAbandon,
}: {
    file: string;
    props: Record<string, unknown>;
    /** Present once the form is settled, which is when this is a record. */
    answers?: Record<string, unknown>;
    /** Which draw this is, so a rewritten gadget is a new module and not the old one. */
    revision: number;
    onAnswer?: (answers: Record<string, unknown>) => void;
    onAbandon?: () => void;
}) {
    const host = useRef<HTMLDivElement>(null);
    const [failure, setFailure] = useState<string>();
    // Held in a ref so that a fresh callback on every render does not take the component
    // down and put it back up again under the user.
    const answer = useRef(onAnswer);
    answer.current = onAnswer;

    useEffect(() => {
        let unmount: (() => void) | undefined;
        let gone = false;
        setFailure(undefined);

        import(`/gadget/${encodeURIComponent(file)}?v=${revision}`)
            .then((module: { mount?: Mount }) => {
                if (gone || !host.current) return;
                if (!module.mount) throw new Error("this gadget exported no component to draw");
                const settled = answers !== undefined;
                unmount = module.mount(host.current, {
                    ...props,
                    ...(settled ? { answers: answers } : { answer: answer.current }),
                });
            })
            .catch((error: Error) => {
                // A gadget that will not compile says so in its own card rather than
                // taking the whole window down with it.
                if (!gone) setFailure(error.message);
            });

        return () => {
            gone = true;
            unmount?.();
        };
    }, [file, revision, props, answers]);

    return (
        <div className="card">
            <div className="ask">{answers === undefined ? "waiting for you" : "answered"}</div>
            <div ref={host} />
            {failure && <div className="note failed">{failure}</div>}
            {answers === undefined && onAbandon && (
                <div className="actions" style={{ marginTop: 10 }}>
                    <button type="button" className="no" onClick={onAbandon}>
                        skip
                    </button>
                </div>
            )}
        </div>
    );
}
