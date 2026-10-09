import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imported, nameOf, packageOf, prune } from "../../src/dependency";

describe("a gadget's packages", () => {
    test("names the package a specifier is an import of", () => {
        expect(packageOf("yaml")).toBe("yaml");
    });

    test("leaves a subpath as the package it hangs off", () => {
        expect(packageOf("zod/v4")).toBe("zod");
    });

    test("keeps the scope in a scoped package name", () => {
        expect(packageOf("@modelcontextprotocol/sdk/client")).toBe("@modelcontextprotocol/sdk");
    });

    test("is nothing at all for a relative, absolute or builtin specifier", () => {
        expect({
            relative: packageOf("./other.ts"),
            parent: packageOf("../other.ts"),
            absolute: packageOf("/opt/lib.js"),
            node: packageOf("node:path"),
            bun: packageOf("bun"),
        }).toEqual({
            relative: undefined,
            parent: undefined,
            absolute: undefined,
            node: undefined,
            bun: undefined,
        });
    });

    test("is nothing at all for what jeng hands a gadget itself", () => {
        expect({ react: packageOf("react"), dom: packageOf("react-dom/client") }).toEqual({
            react: undefined,
            dom: undefined,
        });
    });

    test("takes the name off what the model asked to install", () => {
        expect([nameOf("yaml@^2"), nameOf("@scope/pkg@1.0.0"), nameOf("yaml")]).toEqual([
            "yaml",
            "@scope/pkg",
            "yaml",
        ]);
    });

    test("finds every way a gadget can name a module", () => {
        const source = [
            'import { a } from "alpha"',
            'import "side-effect"',
            'export { b } from "./sibling.ts"',
            'export * from "@scope/beta"',
            'const c = await import("gamma")',
            'const d = require("delta")',
        ].join("\n");

        expect(imported(source)).toEqual(["@scope/beta", "alpha", "delta", "gamma", "side-effect"]);
    });

    test("leaves a home alone that has installed nothing", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-dependency-"));

        expect(await prune(dir)).toEqual([]);
        await rm(dir, { recursive: true, force: true });
    });
});
