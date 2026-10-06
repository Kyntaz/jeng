import { describe, expect, test } from "bun:test";
import type { SessionRef } from "@jeng/core";
import type { State } from "@jeng/view";
import { renderToStaticMarkup } from "react-dom/server";
import { Picker } from "../../src/view/picker";
import type { Bridge } from "../../src/view/rpc";

const state: State = {
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

const session = (id: string, title: string): SessionRef => ({
    id,
    title,
    started: "2026-10-06T14:02:11.204Z",
    updated: "2026-10-06T14:19:02.881Z",
    file: `/home/jeng/sessions/${id}.json`,
});

/** A picker with no transport behind it, because nothing here asks anything of one. */
const shown = (configs: string[], over: Partial<State> = {}, sessions: SessionRef[] = []) =>
    renderToStaticMarkup(
        <Picker
            bridge={{} as Bridge}
            configs={configs}
            sessions={sessions}
            state={{ ...state, ...over }}
            onConfigs={() => {}}
            onClose={() => {}}
        />,
    );

describe("the picker", () => {
    test("lists every config it has been shown", () => {
        const markup = shown(["/a/jeng.json", "/b/jeng.json"], { config: undefined });

        expect(markup).toContain("/a/jeng.json");
        expect(markup).toContain("/b/jeng.json");
    });

    test("marks the one in force, so the list says which jeng is actually running", () => {
        const markup = shown(["/a/jeng.json", "/b/jeng.json"], { config: "/b/jeng.json" });

        expect(markup).toContain('pick picked">/b/jeng.json');
    });

    test("marks the environment when there is no config file", () => {
        const markup = shown([], { config: undefined });

        expect(markup).toContain('pick picked">no config file');
    });

    test("offers to forget a config that is not the one in force", () => {
        expect(shown(["/a/jeng.json"], { config: "/b/jeng.json" })).toContain("forget");
    });

    test("will not forget the config in force, which would mean applying none at all", () => {
        expect(shown(["/a/jeng.json"], { config: "/a/jeng.json" })).not.toContain("forget");
    });

    test("offers a way to add one the window has never seen", () => {
        expect(shown([])).toContain("add a config file");
    });

    test("says which directory it works in and offers to change it", () => {
        const markup = shown([]);

        expect(markup).toContain("/work/jeng");
        expect(markup).toContain("change…");
    });

    test("says a config inside that directory relative to it", () => {
        const markup = shown(["/work/jeng/jeng.json"]);

        expect(markup).toContain(">jeng.json</button>");
    });

    test("lists the conversations this home has already had", () => {
        const markup = shown([], {}, [session("2026-10-06T14-02-11", "what files are in src?")]);

        expect(markup).toContain("what files are in src?");
    });

    test("says a session nothing was asked in rather than leaving its name empty", () => {
        expect(shown([], {}, [session("2026-10-06T14-02-11", "")])).toContain("nothing said yet");
    });

    test("says so when there is nothing to load yet", () => {
        expect(shown([])).toContain("no sessions yet");
    });
});
