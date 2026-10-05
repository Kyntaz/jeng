import { describe, expect, test } from "bun:test";
import type { Approval } from "@jeng/core";
import type { Ask, Entry } from "@jeng/view";
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalCard } from "../../src/view/approval";
import { Transcript } from "../../src/view/transcript";

type Drawn = Extract<Entry, { kind: "view" }>;

const FILE = "/home/jeng/gadgets/review.tsx";

const draw = (props: Record<string, unknown>): Drawn => ({
    kind: "view",
    draw: { surface: "gui", file: FILE, props },
    mode: "learn",
});

/**
 * A form and the ask that opened it. They share one props object, because that object is
 * what tells the transcript which ask a draw belongs to.
 */
function form(props: Record<string, unknown> = { diff: "a" }) {
    const entry = draw(props);
    const ask: Ask = { id: 1, draw: entry.draw, resolve: () => {} };
    return { entry, ask };
}

const told = (entries: Entry[], asks: Ask[] = []) =>
    renderToStaticMarkup(
        <Transcript
            entries={entries}
            asks={asks}
            thinking={false}
            onAnswer={() => {}}
            onAbandon={() => {}}
        />,
    );

describe("the transcript", () => {
    test("says what the user asked", () => {
        expect(told([{ kind: "user", text: "what files are in src?" }])).toContain(
            "what files are in src?",
        );
    });

    test("says what jeng answered", () => {
        expect(told([{ kind: "jeng", text: "three of them", mode: "learn" }])).toContain(
            "three of them",
        );
    });

    test("leaves what an action returned out until it is asked for", () => {
        const entries: Entry[] = [{ kind: "output", icon: "↳", text: "3 files", mode: "learn" }];

        expect(told(entries)).not.toContain("3 files");
        expect(
            renderToStaticMarkup(
                <Transcript
                    entries={entries}
                    asks={[]}
                    thinking={true}
                    onAnswer={() => {}}
                    onAbandon={() => {}}
                />,
            ),
        ).toContain("3 files");
    });

    test("says which action failed rather than hiding it, because that is the answer", () => {
        const entries: Entry[] = [
            { kind: "failure", icon: "↳", text: "no such file", mode: "learn" },
        ];

        expect(told(entries)).toContain("no such file");
    });

    test("shows an approval as the thing being asked about, with its source", () => {
        const entry: Entry = {
            kind: "approval",
            approval: {
                kind: "create gadget",
                name: "greet",
                source: "export default async () => 'hi'",
                reason: "so i can say hi",
            },
        };

        const markup = told([entry]);

        expect(markup).toContain("create gadget");
        expect(markup).toContain("greet");
        expect(markup).toContain("export default async () =&gt; &#x27;hi&#x27;");
    });

    test("draws a gadget's component as a card rather than as text", () => {
        const markup = told([draw({ diff: "a" })]);

        expect(markup).toContain("waiting for you");
        expect(markup).toContain("card");
    });

    test("draws a form again as a record once it has been answered", () => {
        const markup = told([{ ...draw({ diff: "a" }), answers: { verdict: "ship it" } }]);

        expect(markup).toContain("answered");
        expect(markup).not.toContain("waiting for you");
    });

    test("offers a way out of a form that is still open", () => {
        const { entry, ask: open } = form();

        expect(told([entry], [open])).toContain("skip");
    });

    test("offers no way out of a form that is already answered", () => {
        expect(told([{ ...draw({ diff: "a" }), answers: {} }])).not.toContain("skip");
    });

    test("says so about a widget tree rather than drawing nothing at all", () => {
        const entry: Entry = {
            kind: "view",
            draw: { surface: "tui", widget: { kind: "text", content: "hi" } },
            mode: "learn",
        };

        expect(told([entry])).toContain("an interface for the terminal");
    });
});

describe("an approval", () => {
    const approval: Approval = {
        kind: "rewrite gadget",
        name: "greet",
        source: "export default async () => 'hi'",
        reason: "it should wave",
    };

    test("names what is at stake and why it is wanted", () => {
        const markup = renderToStaticMarkup(
            <ApprovalCard approval={approval} onDecide={() => {}} />,
        );

        expect(markup).toContain("rewrite gadget");
        expect(markup).toContain("greet");
    });

    test("shows the whole source rather than a summary of it", () => {
        const markup = renderToStaticMarkup(
            <ApprovalCard approval={approval} onDecide={() => {}} />,
        );

        expect(markup).toContain("export default async () =&gt; &#x27;hi&#x27;");
    });

    test("offers both ways out", () => {
        const markup = renderToStaticMarkup(
            <ApprovalCard approval={approval} onDecide={() => {}} />,
        );

        expect(markup).toContain("approve");
        expect(markup).toContain("reject");
    });

    test("leaves room for a reason, because turning something down is worth more than a click", () => {
        const markup = renderToStaticMarkup(
            <ApprovalCard approval={approval} onDecide={() => {}} />,
        );

        expect(markup).toContain("<textarea");
    });
});
