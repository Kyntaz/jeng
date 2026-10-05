import { describe, expect, test } from "bun:test";
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
};

/** A picker with no transport behind it, because nothing here asks anything of one. */
const shown = (configs: string[], over: Partial<State> = {}) =>
    renderToStaticMarkup(
        <Picker
            bridge={{} as Bridge}
            configs={configs}
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
});
