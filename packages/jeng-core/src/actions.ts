import { join } from "node:path";
import { runGadget } from "./gadget";
import { loadHome, type Home } from "./home";
import { writeProtocol } from "./header";
import { validateGadget, validateGadgetSyntax, validateProtocol } from "./validate";

export type ActionResult = { ok: boolean; content: string };

export const ACTIONS = ["run_gadget", "load_protocol", "create_protocol", "create_gadget"];

export const JENG_TOOL = {
    name: "jeng",
    description: [
        "Do something. You have no other tool.",
        "action=run_gadget name, input: run an existing gadget with input as a JSON object.",
        "action=load_protocol name: pull a protocol's contents into your context.",
        "action=create_protocol name, when, description, content: commit knowledge to memory.",
        "action=create_gadget name, description, source: write a new gadget. source is a complete TypeScript file that starts with a `/** name: <name> */` `/** description: <description> */` header and ends in an `export default` function.",
    ].join("\n"),
    parameters: {
        type: "object",
        properties: {
            action: { type: "string", enum: ACTIONS },
            name: { type: "string", description: "gadget or protocol name, kebab-case" },
            input: { type: "object", description: "input for run_gadget" },
            when: { type: "string", description: "for create_protocol: when to load this protocol" },
            description: { type: "string" },
            content: { type: "string", description: "for create_protocol: the markdown body" },
            source: { type: "string", description: "for create_gadget: the complete TypeScript source" },
        },
        required: ["action"],
    },
};

export interface ActionContext {
    homes: Home[];
    cwd: string;
}

const primaryHome = (ctx: ActionContext) => ctx.homes[0]?.dir ?? join(ctx.cwd, ".jeng");

const findGadget = (ctx: ActionContext, name: string) => ctx.homes.flatMap((home) => home.gadgets).find((it) => it.name === name);

const findProtocol = (ctx: ActionContext, name: string) => ctx.homes.flatMap((home) => home.protocols).find((it) => it.name === name);

async function refreshPrimary(ctx: ActionContext): Promise<void> {
    const dir = primaryHome(ctx);
    const refreshed = await Promise.all(ctx.homes.map((home) => (home.dir === dir ? loadHome(home.dir) : home)));
    ctx.homes.splice(0, ctx.homes.length, ...refreshed);
}

async function runGadgetAction(ctx: ActionContext, args: Record<string, unknown>): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const found = findGadget(ctx, name);
    if (!found) return { ok: false, content: `no gadget named "${name}"` };

    const result = await runGadget(found.file, args.input);
    return { ok: result.ok, content: result.ok ? result.output : result.error };
}

async function loadProtocolAction(ctx: ActionContext, args: Record<string, unknown>): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const found = findProtocol(ctx, name);
    if (!found) return { ok: false, content: `no protocol named "${name}"` };

    return { ok: true, content: await Bun.file(found.file).text() };
}

async function createProtocolAction(ctx: ActionContext, args: Record<string, unknown>): Promise<ActionResult> {
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

async function createGadgetAction(ctx: ActionContext, args: Record<string, unknown>): Promise<ActionResult> {
    const name = String(args.name ?? "");
    if (findGadget(ctx, name)) return { ok: false, content: `gadget "${name}" already exists` };

    const source = String(args.source ?? "");
    const valid = validateGadget(source);
    if (!valid.ok) return { ok: false, content: valid.error };

    const dir = join(primaryHome(ctx), "gadgets");
    await Bun.$`mkdir -p ${dir}`.quiet();

    const temp = join(dir, `.pending-${name}.ts`);
    await Bun.write(temp, source);

    const compiles = await validateGadgetSyntax(temp);
    if (!compiles.ok) {
        await Bun.file(temp).delete();
        return { ok: false, content: compiles.error };
    }

    await Bun.write(join(dir, `${name}.ts`), source);
    await Bun.file(temp).delete();
    await refreshPrimary(ctx);

    return { ok: true, content: `gadget "${name}" created at ${join(dir, `${name}.ts`)}` };
}

export async function runAction(action: string, args: Record<string, unknown>, ctx: ActionContext): Promise<ActionResult> {
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
            return { ok: false, content: `unknown action "${action}". Available: ${ACTIONS.join(", ")}` };
    }
}