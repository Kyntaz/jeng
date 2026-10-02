import { describe, expect, test } from "bun:test";
import { buildContext } from "../../src/context";
import type { Home } from "../../src/home";

const HOME: Home = {
    dir: "/home/jeng",
    agents: "speak plainly",
    gadgets: [
        { name: "greet", description: "says hi", when: "", file: "/home/jeng/gadgets/greet.ts" },
    ],
    protocols: [
        {
            name: "deploy",
            description: "shipping steps",
            when: "deploying",
            file: "/home/jeng/protocols/deploy.md",
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
});
