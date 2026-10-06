import { type Header, parseGadget, parseProtocol } from "./header";

type Validation = { ok: true } | { ok: false; error: string };

/** The header comes back with it, because the caller needs the name and the extension too. */
type GadgetValidation = { ok: true; header: Header } | { ok: false; error: string };

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function checkHeader(header: Header, required: (keyof Header)[]): Validation {
    for (const key of required) {
        if (!header[key].trim())
            return { ok: false, error: `header is missing a non-empty \`${key}\`` };
    }
    if (!NAME.test(header.name)) {
        const suggestion = header.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        return {
            ok: false,
            error: `header \`name\` must be kebab-case (got "${header.name}"), e.g. \`${suggestion}\``,
        };
    }
    return { ok: true };
}

export function validateProtocol(source: string): Validation {
    const parsed = parseProtocol(source);
    if (!parsed)
        return {
            ok: false,
            error: "protocol must start with a `---` fenced header of `field: value` lines",
        };

    const valid = checkHeader(parsed.header, ["name", "description", "when"]);
    if (!valid.ok) return valid;
    if (!parsed.body.trim())
        return {
            ok: false,
            error: "protocol body is empty; write the knowledge itself below the header",
        };

    return { ok: true };
}

export function validateGadget(source: string): GadgetValidation {
    const header = parseGadget(source);
    if (!header)
        return {
            ok: false,
            error: "gadget must start with a `/** ... */` header of `field: value` lines",
        };

    const valid = checkHeader(header, ["name", "description"]);
    if (!valid.ok) return valid;
    if (!/export\s+default|as\s+default/.test(source))
        return { ok: false, error: "gadget must `export default` a function" };

    if (header.ui === "true" && header.gui === "true")
        return {
            ok: false,
            error: "header declares both `ui` and `gui`: a gadget draws either a widget tree or a react component, not both",
        };

    // The component is found by name in the gadget's own file, so a header that claims
    // one and an export that does not have it is an interface nobody could ever draw.
    if (
        header.gui === "true" &&
        !/export\s+(?:async\s+)?(?:function|const|let|var)\s+View\b/.test(source)
    )
        return {
            ok: false,
            error: "header declares `gui: true` but there is no `export function View` to draw",
        };

    return { ok: true, header };
}

export async function validateGadgetSyntax(file: string): Promise<Validation> {
    const proc = Bun.spawn(["bun", "build", "--target=bun", "--no-bundle", file], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    if (code === 0) return { ok: true };

    const detail =
        stderr.split("\n").find((line) => /error/i.test(line)) ??
        stderr.trim().split("\n")[0] ??
        "unknown error";
    return { ok: false, error: `gadget does not compile: ${detail.trim()}` };
}
