import { describe, expect, test } from "bun:test";
import type { Approval } from "@jeng/core";
import type { Entry, Pending } from "@jeng/view";
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalCard } from "../../src/view/approval";
import { Transcript } from "../../src/view/transcript";

type Drawn = Extract<Entry, { kind: "view" }>;

const FILE = "/home/jeng/gadgets/review.tsx";

// A row and a draw are numbered apart, as they are in a conversation: the conversation
// numbers the row, the agent numbers the draw, and the two counters have nothing to do
// with each other.
let rows = 0;
let drawn = 0;

const draw = (props: Record<string, unknown>): Drawn => ({
    kind: "view",
    id: ++rows,
    draw: { surface: "gui", id: ++drawn, file: FILE, props },
    mode: "learn",
});

/**
 * A form and the ask that opened it. They share one number, because that is what tells the
 * transcript which ask a draw belongs to — across a JSON boundary, where sharing the props
 * object would have meant nothing.
 */
function form(props: Record<string, unknown> = { diff: "a" }) {
    const entry = draw(props);
    const ask: Pending = { id: 1, draw: entry.draw };
    return { entry, ask };
}

/**
 * Code arrives marked up by highlight.js and escaped, so what a test wants to read is the
 * words themselves rather than the spans and entities they were written through.
 */
const withoutMarkup = (markup: string) =>
    markup
        .replace(/<[^>]*>/g, "")
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#x27;", "'");

const told = (entries: Entry[], asks: Pending[] = [], approving?: number) =>
    renderToStaticMarkup(
        <Transcript
            entries={entries}
            asks={asks}
            thinking={false}
            approving={approving}
            onAnswer={() => {}}
            onAbandon={() => {}}
        />,
    );

describe("the transcript", () => {
    test("says what the user asked", () => {
        expect(told([{ kind: "user", id: 1, text: "what files are in src?" }])).toContain(
            "what files are in src?",
        );
    });

    test("says what jeng answered", () => {
        expect(told([{ kind: "jeng", id: 1, text: "three of them", mode: "learn" }])).toContain(
            "three of them",
        );
    });

    test("leaves what an action returned out until it is asked for", () => {
        const entries: Entry[] = [
            { kind: "output", id: 1, icon: "↳", text: "3 files", mode: "learn" },
        ];

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
            { kind: "failure", id: 1, icon: "↳", text: "no such file", mode: "learn" },
        ];

        expect(told(entries)).toContain("no such file");
    });

    test("shows an approval as the thing being asked about, with its source", () => {
        const entry: Entry = {
            kind: "approval",
            id: 1,
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
        expect(withoutMarkup(markup)).toContain("export default async () => 'hi'");
    });

    test("leaves the transcript's copy out while the card is drawing the same approval", () => {
        const entry: Entry = {
            kind: "approval",
            id: 7,
            approval: { kind: "delete gadget", name: "a.ts", source: "", reason: "it is old" },
        };

        expect(told([entry], [], 7)).not.toContain("delete file");
    });

    test("keeps the record once it has been answered and the card is gone", () => {
        const entry: Entry = {
            kind: "approval",
            id: 7,
            approval: { kind: "delete gadget", name: "a.ts", source: "", reason: "it is old" },
        };

        expect(told([entry], [], 8)).toContain("delete gadget");
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
            id: 1,
            draw: { surface: "tui", widget: { kind: "text", content: "hi" } },
            mode: "learn",
        };

        expect(told([entry])).toContain("an interface for the terminal");
    });

    test("gives every row a number of its own, which is the only thing telling two apart", () => {
        const rows = [draw({ diff: "a" }), draw({ diff: "b" }), draw({ diff: "c" })];

        expect(new Set(rows.map((entry) => entry.id)).size).toBe(3);
    });

    test("holds a row's number through a window reading the state as JSON", () => {
        // What a window actually gets: the value, written down and read back. A row named
        // by the object holding it is a new row on every word the model says, and a gadget
        // in it is torn down and rebuilt each time.
        const rows: Entry[] = [draw({ diff: "a" }), draw({ diff: "b" })];
        const [once, twice] = [
            JSON.parse(JSON.stringify(rows)),
            JSON.parse(JSON.stringify(rows)),
        ] as [Entry[], Entry[]];

        expect(twice.map((entry) => entry.id)).toEqual(once.map((entry) => entry.id));
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

        expect(withoutMarkup(markup)).toContain("export default async () => 'hi'");
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
