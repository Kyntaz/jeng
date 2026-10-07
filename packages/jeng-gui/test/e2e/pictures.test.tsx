import { afterAll, describe, test } from "bun:test";
import type { Approval, SessionRef } from "@jeng/core";
import { STYLES, type StyleName } from "@jeng/core";
import type { Entry, State } from "@jeng/view";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../../src/view/app";
import { Picker } from "../../src/view/picker";
import type { Bridge } from "../../src/view/rpc";
import { picture, stop } from "./harness";

/**
 * What the window looks like, once it is put in front of a real browser and photographed.
 *
 * A style change is a change nobody can argue with once it can be looked at, so each
 * scenario is a window holding everything that shares a look — slips, cards, code, the
 * composer, the picker — and the picture is compared against the last one kept. This says
 * what a change did to the window in a way no assertion on markup ever can.
 */

const quiet: State = {
    entries: [],
    asks: [],
    approval: undefined,
    busy: false,
    tokens: 0,
    mode: "learn",
    thinking: false,
    homes: ["/home/jeng"],
    model: "test-model",
    cwd: "/work/jeng",
    config: "/home/jeng/jeng.json",
    agents: [],
};

/** A window that is only ever looked at, because nothing here has a transport. */
const still = (state: State): Bridge =>
    ({
        get: () => state,
        subscribe: () => () => {},
        hello: async () => [],
        set: async () => ({ ok: true, configs: [] }),
        forget: async () => ({ ok: true, configs: [] }),
        browseConfig: async () => ({ ok: true, configs: [] }),
        browseCwd: async () => ({ ok: true, configs: [] }),
        send: async () => ({ sent: true }),
        interrupt: async () => {},
        clear: async () => {},
        setMode: async () => {},
        toggleThinking: async () => {},
        answer: async () => {},
        abandon: async () => {},
        decide: async () => {},
    }) as unknown as Bridge;

const drawn = (state: State) => renderToStaticMarkup(<App bridge={still(state)} />);

/**
 * A whole turn of every kind there is, since what has to be read is whether a message, a
 * tool call, a failure and a patch still look like they belong to the same desk.
 */
const said: Entry[] = [
    { kind: "user", id: 1, text: "what does src/main/window.ts do?" },
    { kind: "think", id: 2, text: "it opens the window the app was told to open", mode: "learn" },
    { kind: "tool", id: 3, icon: "⚙", text: "read path=src/main/window.ts", mode: "learn" },
    { kind: "output", id: 4, icon: "↳", text: "export async function open() {}", mode: "learn" },
    {
        kind: "failure",
        id: 5,
        icon: "↳",
        text: "no config file at /work/jeng/jeng.json",
        mode: "learn",
    },
    {
        kind: "jeng",
        id: 6,
        text: "It builds the agent from a config file and hands it to the window. The window asks for the state once it is listening, because there is no telling when that happens.",
        mode: "learn",
    },
];

const patch = `diff --git a/src/view/theme.css b/src/view/theme.css
index 5b1e2a0..9f0c4d8 100644
--- a/src/view/theme.css
+++ b/src/view/theme.css
@@ -14,7 +14,7 @@
     --jeng-border: #e2d8c6;
-    --jeng-radius: 8px;
-    --jeng-shadow: 0 1px 2px rgb(90 72 48 / 6%), 0 4px 12px rgb(90 72 48 / 7%);
+    --jeng-radius: 0px;
+    --jeng-shadow: 6px 6px 0 rgb(90 72 48 / 25%);`;

const gadget: Approval = {
    kind: "create gadget",
    name: "review",
    reason: "a form for handing back what you make of a patch",
    source: `export function View({ patch }: { patch: string }) {
    return <div className="card"><pre>{patch}</pre></div>;
}`,
};

const session = (id: string, title: string, updated: string): SessionRef => ({
    id,
    title,
    started: "2026-10-06T14:02:11.204Z",
    updated,
    file: `/home/jeng/sessions/${id}.json`,
});

describe("the window as a picture", () => {
    afterAll(stop);

    test("a window that has been pointed at something and has said nothing yet", async () => {
        await picture("idle", drawn({ ...quiet, tokens: 1284 }));
    });

    test("a conversation with every kind of turn in it, laid out as one scroll", async () => {
        await picture(
            "conversation",
            drawn({
                ...quiet,
                entries: said,
                thinking: true,
                agents: ["/work/jeng", "/home/jeng/.jeng"],
                tokens: 20431,
            }),
        );
    });

    test("the same conversation in work, which is the other of the palette's two ends", async () => {
        await picture(
            "work",
            drawn({
                ...quiet,
                mode: "work",
                entries: said.map((entry) => ({ ...entry, mode: "work" as const })),
                thinking: true,
                agents: ["/work/jeng"],
                tokens: 5120,
            }),
        );
    });

    test("a turn in flight, which is where the spinner and the busy dot are", async () => {
        await picture("working", drawn({ ...quiet, entries: said.slice(0, 4), busy: true }));
    });

    test("a patch in the record of an approval, read for what changed in it", async () => {
        await picture(
            "patch",
            drawn({
                ...quiet,
                entries: [
                    { kind: "user", id: 1, text: "round the corners off" },
                    { kind: "approval", id: 2, approval: { ...gadget, source: patch } },
                    { kind: "user", id: 3, text: "approved" },
                ],
            }),
        );
    });

    test("a permission being asked for, in the place it is answered", async () => {
        await picture(
            "approval",
            drawn({
                ...quiet,
                busy: true,
                entries: [
                    { kind: "user", id: 6, text: "make me a form for reading a patch" },
                    { kind: "approval", id: 7, approval: gadget },
                ],
                approval: { id: 7, approval: gadget },
            }),
        );
    });

    test("the picker over the window, with a config in force and sessions to go back to", async () => {
        await picture(
            "picker",
            renderToStaticMarkup(
                <Picker
                    bridge={{} as Bridge}
                    configs={["/home/jeng/jeng.json", "/work/jeng/jeng.json", "/a/config.json"]}
                    sessions={[
                        session(
                            "2026-10-06T14-02-11",
                            "what files are in src?",
                            "2026-10-06T14:19:02.881Z",
                        ),
                    ]}
                    state={quiet}
                    onConfigs={() => {}}
                    onClose={() => {}}
                />,
            ),
        );
    });

    /**
     * Every builtin style, in one window apiece.
     *
     * Six palettes is a claim about how six windows look, and a claim about pixels is only
     * worth something if the pixels are kept. So each style is the same conversation
     * rendered against the same components, and any change to any of them fails here saying
     * which style moved — including a change made in the hope that nobody would notice it on
     * the default, which is the change most worth noticing.
     */
    for (const name of Object.keys(STYLES) as StyleName[]) {
        test(`a window in ${name}`, async () => {
            await picture(
                `style-${name}`,
                drawn({
                    ...quiet,
                    entries: said,
                    thinking: true,
                    agents: ["/work/jeng"],
                    tokens: 20431,
                }),
                STYLES[name],
            );
        });
    }
});
