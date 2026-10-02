import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateGadget, validateGadgetSyntax, validateProtocol } from "../../src/validate";

const PROTOCOL = "---\nname: deploy-flow\ndescription: how we ship\nwhen: deploying\n---\n\nrun make then push\n";
const GADGET = "/**\n * name: greet\n * description: greets\n */\n\nexport default async () => \"hi\"\n";

describe("validate", () => {
    test("accepts a well formed protocol", () => {
        expect(validateProtocol(PROTOCOL)).toEqual({ ok: true });
    });

    test("names the missing header field of a protocol", () => {
        expect(validateProtocol("---\nname: deploy-flow\ndescription: how we ship\n---\n\nbody\n")).toEqual({
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
        const result = validateProtocol("---\nname: deploy-flow\ndescription: how we ship\nwhen: deploying\n---\n");

        expect(result).toEqual({ ok: false, error: "protocol body is empty; write the knowledge itself below the header" });
    });

    test("accepts a well formed gadget", () => {
        expect(validateGadget(GADGET)).toEqual({ ok: true });
    });

    test("rejects a gadget without a header", () => {
        const result = validateGadget("export default async () => \"hi\"\n");

        expect(result).toEqual({ ok: false, error: "gadget must start with a `/** ... */` header of `field: value` lines" });
    });

    test("rejects a gadget without a default export", () => {
        const result = validateGadget("/**\n * name: greet\n * description: greets\n */\n\nconst hi = () => \"hi\"\n");

        expect(result).toEqual({ ok: false, error: "gadget must `export default` a function" });
    });

    test("accepts a gadget that compiles", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-validate-"));
        const file = join(dir, "greet.ts");
        await Bun.write(file, GADGET);

        expect(await validateGadgetSyntax(file)).toEqual({ ok: true });
        await rm(dir, { recursive: true, force: true });
    });

    test("rejects a gadget that does not compile", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-validate-"));
        const file = join(dir, "broken.ts");
        await Bun.write(file, "/**\n * name: broken\n * description: nope\n */\n\nexport default async () => {\n");

        const result = await validateGadgetSyntax(file);

        expect(result.ok).toBe(false);
        await rm(dir, { recursive: true, force: true });
    });
});