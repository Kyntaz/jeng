import { describe, expect, test } from "bun:test";
import { validateGadget, validateGadgetSyntax, validateProtocol } from "../../src/validate";

const PROTOCOL =
    "---\nname: deploy-flow\ndescription: how we ship\nwhen: deploying\n---\n\nrun make then push\n";
const GADGET =
    '/**\n * name: greet\n * description: greets\n */\n\nexport default async () => "hi"\n';
const GUI_GADGET =
    '/**\n * name: review\n * gui: true\n * description: asks for a look\n */\n\nexport function View() {\n    return null;\n}\n\nexport default async () => "looked"\n';
const GUI_GADGET_JSX =
    '/**\n * name: review\n * gui: true\n * description: asks\n */\n\nexport function View() {\n    return <p>look</p>;\n}\n\nexport default async () => "looked"\n';

const IMPORTING =
    '/**\n * name: parse\n * description: parses yaml\n */\n\nimport { parse } from "yaml"\nimport { join } from "node:path"\nimport { useState } from "react"\n\nexport default async () => parse(join("a", "b"))\n';

describe("validate", () => {
    test("accepts a well formed protocol", () => {
        expect(validateProtocol(PROTOCOL)).toEqual({ ok: true });
    });

    test("names the missing header field of a protocol", () => {
        expect(
            validateProtocol("---\nname: deploy-flow\ndescription: how we ship\n---\n\nbody\n"),
        ).toEqual({
            ok: false,
            error: "header is missing a non-empty `when`",
        });
    });

    test("rejects a protocol whose name is not kebab-case", () => {
        expect(validateProtocol(PROTOCOL.replace("deploy-flow", "Deploy Flow"))).toEqual({
            ok: false,
            error: 'header `name` must be kebab-case (got "Deploy Flow"), e.g. `deploy-flow`',
        });
    });

    test("rejects a protocol with an empty body", () => {
        const result = validateProtocol(
            "---\nname: deploy-flow\ndescription: how we ship\nwhen: deploying\n---\n",
        );

        expect(result).toEqual({
            ok: false,
            error: "protocol body is empty; write the knowledge itself below the header",
        });
    });

    test("accepts a well formed gadget", () => {
        expect(validateGadget(GADGET)).toEqual({
            ok: true,
            header: { name: "greet", description: "greets", when: "", ui: "", gui: "" },
        });
    });

    test("rejects a gadget without a header", () => {
        const result = validateGadget('export default async () => "hi"\n');

        expect(result).toEqual({
            ok: false,
            error: "gadget must start with a `/** ... */` header of `field: value` lines",
        });
    });

    test("rejects a gadget without a default export", () => {
        const result = validateGadget(
            '/**\n * name: greet\n * description: greets\n */\n\nconst hi = () => "hi"\n',
        );

        expect(result).toEqual({ ok: false, error: "gadget must `export default` a function" });
    });

    test("accepts a gadget that draws a react component", () => {
        expect(validateGadget(GUI_GADGET).ok).toBe(true);
    });

    test("rejects a gadget that claims a window without exporting a component to draw", () => {
        const result = validateGadget(GUI_GADGET.replace("export function View()", "const View ="));

        expect(result).toEqual({
            ok: false,
            error: "header declares `gui: true` but there is no `export function View` to draw",
        });
    });

    test("rejects a gadget that claims both surfaces at once", () => {
        const result = validateGadget(
            GUI_GADGET.replace(" * gui: true", " * ui: true\n * gui: true"),
        );

        expect(result).toEqual({
            ok: false,
            error: "header declares both `ui` and `gui`: a gadget draws either a widget tree or a react component, not both",
        });
    });

    test("rejects a gadget that imports a package it did not ask for", () => {
        expect(validateGadget(IMPORTING)).toEqual({
            ok: false,
            error: "gadget imports a package `dependencies` does not ask for: `yaml`",
        });
    });

    test("accepts a gadget whose package it asked for by name and range", () => {
        expect(validateGadget(IMPORTING, ["yaml@^2"]).ok).toBe(true);
    });

    test("takes the name off a range before comparing it", () => {
        expect(validateGadget(IMPORTING, ["yaml"]).ok).toBe(true);
    });

    test("names every package it refused rather than only the first", () => {
        expect(validateGadget(`${IMPORTING}import "kleur"\n`, ["yaml"])).toEqual({
            ok: false,
            error: "gadget imports a package `dependencies` does not ask for: `kleur`",
        });
    });

    test("compiles a gadget that draws jsx, because its header gave it a tsx file", () => {
        expect(validateGadgetSyntax(GUI_GADGET_JSX, "tsx")).toEqual({ ok: true });
    });

    test("accepts a gadget that compiles", () => {
        expect(validateGadgetSyntax(GADGET, "ts")).toEqual({ ok: true });
    });

    test("rejects a gadget that does not compile", () => {
        expect(
            validateGadgetSyntax(
                "/**\n * name: broken\n * description: nope\n */\n\nexport default async () => {\n",
                "ts",
            ),
        ).toEqual({
            ok: false,
            error: "gadget does not compile: Unexpected end of file",
        });
    });
});
