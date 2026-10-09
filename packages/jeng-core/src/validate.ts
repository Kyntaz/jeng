import { imported, nameOf } from "./dependency";
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

export function validateGadget(source: string, declared: string[] = []): GadgetValidation {
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

    // A package is fetched from npm and its lifecycle scripts run, so an import the model
    // did not ask for is code nobody approved. Naming them here means the model is told
    // before the user is troubled with it.
    const asked = new Set(declared.map(nameOf));
    const unasked = imported(source).filter((name) => !asked.has(name));
    if (unasked.length > 0)
        return {
            ok: false,
            error: `gadget imports a package \`dependencies\` does not ask for: ${unasked.map((name) => `\`${name}\``).join(", ")}`,
        };

    return { ok: true, header };
}

/**
 * The source is parsed rather than run, which is what keeps a syntax error from being
 * found out by executing code nobody has read. The loader is the extension the header
 * already decided, so a gadget that writes jsx is parsed as jsx.
 */
export function validateGadgetSyntax(source: string, loader: "ts" | "tsx"): Validation {
    try {
        new Bun.Transpiler({ loader }).transformSync(source);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: `gadget does not compile: ${(error as Error).message}` };
    }
}
