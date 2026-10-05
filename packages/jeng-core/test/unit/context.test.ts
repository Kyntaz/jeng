import { describe, expect, test } from "bun:test";
import { buildContext, loadedAgents } from "../../src/context";
import type { Home } from "../../src/home";

const HOME: Home = {
    dir: "/home/jeng",
    agents: "speak plainly",
    gadgets: [
        {
            name: "greet",
            description: "says hi",
            when: "",
            file: "/home/jeng/gadgets/greet.ts",
            ui: false,
        },
        {
            name: "pick",
            description: "asks which branch",
            when: "",
            file: "/home/jeng/gadgets/pick.ts",
            ui: true,
        },
    ],
    protocols: [
        {
            name: "deploy",
            description: "shipping steps",
            when: "deploying",
            file: "/home/jeng/protocols/deploy.md",
            ui: false,
        },
    ],
};

describe("context", () => {
    test("lists gadgets with their description and protocols with their trigger", () => {
        const context = buildContext([HOME], []);

        expect(context).toContain("- `greet`: says hi");
        expect(context).toContain("- `deploy` (load when: deploying): shipping steps");
    });

    test("always includes the home AGENTS.md", () => {
        expect(buildContext([HOME], [])).toContain("speak plainly");
    });

    test("places loaded protocol bodies in context", () => {
        expect(
            buildContext([HOME], [], [{ name: "deploy", body: "run make then push" }]),
        ).toContain("run make then push");
    });

    test("omits sections that have nothing in them", () => {
        expect(
            buildContext([{ dir: "/empty", agents: undefined, gadgets: [], protocols: [] }], []),
        ).not.toContain("## Gadgets");
    });

    test("tells the model how much of its context is gone", () => {
        expect(buildContext([HOME], [], [], { tokens: 1200, contextWindow: 8192 })).toContain(
            "Context: 1200/8192 tokens.",
        );
    });

    test("tells the model to compact once it is near the limit", () => {
        expect(buildContext([HOME], [], [], { tokens: 7000, contextWindow: 8192 })).toContain(
            "Compact now.",
        );
    });

    test("leaves the context line out when nothing is known yet", () => {
        expect(buildContext([HOME], [])).not.toContain("Context:");
    });

    test("lists a gadget that draws when there is a ui to draw it on", () => {
        expect(
            buildContext([HOME], [], [], { tokens: 0, contextWindow: 8192, ui: true }),
        ).toContain("- `pick`: asks which branch");
    });

    test("leaves out a gadget that draws when there is nowhere to draw it", () => {
        expect(buildContext([HOME], [])).not.toContain("`pick`");
    });

    test("tells a learning jeng how to grow by default", () => {
        expect(buildContext([HOME], [])).toContain("How you grow:");
    });

    test("tells a working jeng what it is working with instead", () => {
        const context = buildContext([HOME], [], [], {
            tokens: 0,
            contextWindow: 8192,
            mode: "work",
        });

        expect(context).not.toContain("How you grow:");
        expect(context).toContain("you cannot change it");
    });

    test("puts the home before the chain walked up from the cwd", () => {
        expect(
            loadedAgents(
                [HOME],
                [
                    { dir: "/work", content: "root rules" },
                    { dir: "/work/packages", content: "package rules" },
                ],
            ).map((file) => file.dir),
        ).toEqual(["/home/jeng", "/work", "/work/packages"]);
    });

    test("leaves out a home that carries no instructions", () => {
        expect(
            loadedAgents([{ dir: "/empty", agents: undefined, gadgets: [], protocols: [] }], []),
        ).toEqual([]);
    });
});
