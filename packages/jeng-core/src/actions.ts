import { join } from "node:path";
import { runGadget } from "./gadget";
import { parseGadget, writeProtocol } from "./header";
import { type Home, loadHome } from "./home";
import { validateGadget, validateGadgetSyntax, validateProtocol } from "./validate";

export type ActionResult = { ok: boolean; content: string };

export const ACTIONS = [
    "run_gadget",
    "load_protocol",
    "create_protocol",
    "create_gadget",
    "end",
    "compact",
];

export const JENG_TOOL = {
    name: "jeng",
    description: [
        "Do one thing. This is your only tool.",
        "",
        "Every message you send is exactly one call to this tool. Your answer is a call too.",
        "",
        'action="end", content=<the answer the user reads>',
        "  Hand control back to the user. This is the only way a turn ever ends, so nothing you say",
        "  in plain text will do it. Put the whole answer in content.",
        '  e.g. {"action":"end","content":"Tokyo is the capital of Japan."}',
        'action="compact", summary=<everything worth keeping from this conversation>',
        "  Throw the transcript away and continue from your summary alone. When the context line at",
        "  the top of your context is near its limit, summarize and call this.",
        'action="run_gadget", name=<existing gadget>, input=<object>',
        "  Run a gadget. `name` must be a gadget listed under Gadgets in your context.",
        'action="create_gadget", name=<new kebab-case name>, description=<one line>, source=<TypeScript>',
        "  Write a gadget you do not have yet.",
        "  source must be a complete TypeScript file that starts with this exact 4-line comment",
        "  header, where the words `name:` and `description:` are literal and required:",
        "",
        "  /**",
        "   * name: count-lines",
        "   * description: counts the lines of a file. input: { path: string }",
        "   */",
        "",
        "  Then code that compiles with bun, ending in:",
        "  export default async (input: { path: string }) => string",
        "  Only `node:*` builtins and the `Bun` global are available. No other package can be imported.",
        "  The description is all you will see about this gadget later, so name its input fields.",
        'action="load_protocol", name=<existing protocol>',
        "  Pull a protocol's body into your context. Use it when the protocol's `when` matches the task.",
        'action="create_protocol", name=<new kebab-case name>, when=<when to load it>, description=<one line>, content=<knowledge>',
        "  Save knowledge worth keeping. Never save a guess: only what you actually learned.",
        "",
        "After every call you get a result. Read it before deciding what to do next.",
        "If a result is an error, do not repeat that same call. Change the arguments, or end without it.",
        "Keep going until you call end. There is no turn limit, so nothing stops you but your own judgement.",
        "If you cannot do something, end with that in one line instead of calling a tool.",
    ].join("\n"),
    parameters: {
        type: "object",
        properties: {
            action: { type: "string", enum: ACTIONS },
            name: { type: "string", description: "gadget or protocol name, kebab-case" },
            input: {
                type: "object",
                description: "arguments for run_gadget, as an object",
            },
            when: {
                type: "string",
                description: "for create_protocol: when to load this protocol",
            },
            description: { type: "string" },
            content: {
                type: "string",
                description:
                    "for create_protocol: the markdown body. for end: the answer the user reads",
            },
            summary: {
                type: "string",
                description: "for compact: what is worth keeping from this conversation",
            },
            source: {
                type: "string",
                description: "for create_gadget: the complete TypeScript file, header first",
            },
        },
        required: ["action"],
    },
};

export interface ActionContext {
    homes: Home[];
    cwd: string;
}

const primaryHome = (ctx: ActionContext) => ctx.homes[0]?.dir ?? join(ctx.cwd, ".jeng");

// Models often send `input` as a json string rather than an object; a gadget
// written against an object signature would otherwise receive a string.
function coerceInput(input: unknown): { bad: string } | { bad: undefined; value: unknown } {
    if (input === undefined || input === null) return { bad: undefined, value: {} };
    if (typeof input !== "string") return { bad: undefined, value: input };

    try {
        return { bad: undefined, value: JSON.parse(input) };
    } catch {
        return { bad: "input must be a json object, not a string" };
    }
}

const findGadget = (ctx: ActionContext, name: string) =>
    ctx.homes.flatMap((home) => home.gadgets).find((it) => it.name === name);

const findProtocol = (ctx: ActionContext, name: string) =>
    ctx.homes.flatMap((home) => home.protocols).find((it) => it.name === name);

async function refreshPrimary(ctx: ActionContext): Promise<void> {
    const dir = primaryHome(ctx);
    const refreshed = await Promise.all(
        ctx.homes.map((home) => (home.dir === dir ? loadHome(home.dir) : home)),
    );
    ctx.homes.splice(0, ctx.homes.length, ...refreshed);
}

async function runGadgetAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const found = findGadget(ctx, name);
    if (!found) return { ok: false, content: `no gadget named "${name}"` };

    const input = coerceInput(args.input);
    if (input.bad !== undefined) return { ok: false, content: input.bad };

    const result = await runGadget(found.file, input.value);
    return { ok: result.ok, content: result.ok ? result.output : result.error };
}

async function loadProtocolAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const found = findProtocol(ctx, name);
    if (!found) return { ok: false, content: `no protocol named "${name}"` };

    return { ok: true, content: await Bun.file(found.file).text() };
}

async function createProtocolAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    if (findProtocol(ctx, name)) return { ok: false, content: `protocol "${name}" already exists` };

    const source = writeProtocol(
        { name, description: String(args.description ?? ""), when: String(args.when ?? "") },
        String(args.content ?? ""),
    );
    const valid = validateProtocol(source);
    if (!valid.ok) return { ok: false, content: valid.error };

    const dir = join(primaryHome(ctx), "protocols");
    await Bun.$`mkdir -p ${dir}`.quiet();
    await Bun.write(join(dir, `${name}.md`), source);
    await refreshPrimary(ctx);

    return { ok: true, content: `protocol "${name}" committed. It is available from now on.` };
}

async function createGadgetAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const source = String(args.source ?? "");
    const valid = validateGadget(source);
    if (!valid.ok) return { ok: false, content: valid.error };

    // The header is what every later read sees, so the file is named after it
    // rather than after whatever the model passed as `name`.
    const name = parseGadget(source)?.name ?? "";
    const existing = findGadget(ctx, name);

    const dir = join(primaryHome(ctx), "gadgets");
    await Bun.$`mkdir -p ${dir}`.quiet();

    const temp = join(dir, `.pending-${name}.ts`);
    await Bun.write(temp, source);

    const compiles = await validateGadgetSyntax(temp);
    if (!compiles.ok) {
        await Bun.file(temp).delete();
        return { ok: false, content: compiles.error };
    }

    // The model cannot edit files, so rewriting a gadget it is unhappy with is
    // the only way it can fix one. Validation has already passed either way.
    await Bun.write(join(dir, `${name}.ts`), source);
    await Bun.file(temp).delete();
    await refreshPrimary(ctx);

    return {
        ok: true,
        content: existing
            ? `gadget "${name}" rewritten at ${join(dir, `${name}.ts`)}`
            : `gadget "${name}" created at ${join(dir, `${name}.ts`)}`,
    };
}

export async function runAction(
    action: string,
    args: Record<string, unknown>,
    ctx: ActionContext,
): Promise<ActionResult> {
    switch (action) {
        case "run_gadget":
            return await runGadgetAction(ctx, args);
        case "load_protocol":
            return await loadProtocolAction(ctx, args);
        case "create_protocol":
            return await createProtocolAction(ctx, args);
        case "create_gadget":
            return await createGadgetAction(ctx, args);
        default:
            return {
                ok: false,
                content: `unknown action "${action}". Available: ${ACTIONS.join(", ")}`,
            };
    }
}
