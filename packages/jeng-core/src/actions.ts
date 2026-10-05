import { join } from "node:path";
import { type ApprovalKind, type Approve, review } from "./approve";
import { prepareGadget } from "./draft";
import { runGadget } from "./gadget";
import { writeProtocol } from "./header";
import { type GadgetRef, type Home, loadHome } from "./home";
import { DEFAULT_MODE, GROWS, type Mode } from "./mode";
import { prompt } from "./prompts";
import { persistentState, type State, type StateMap } from "./state";
import { actionsFor } from "./tool";
import { UI_LANGUAGE, type Ui } from "./ui";
import { validateProtocol } from "./validate";

export type ActionResult = { ok: boolean; content: string };

export interface ActionContext {
    homes: Home[];
    cwd: string;
    approve: Approve;
    /** Absent wherever there is no interface to draw on, which is what makes a run headless. */
    ui?: Ui;
    mode?: Mode;
    session: StateMap;
}

const primaryHome = (ctx: ActionContext) => ctx.homes[0]?.dir ?? join(ctx.cwd, ".jeng");

// A gadget keeps what it commits in the home it came from, and its session is the
// run's whichever home that is.
const stateFor = (ctx: ActionContext, dir: string): State => ({
    session: ctx.session,
    persistent: persistentState(dir),
});

// The home is only ever written to once the user has agreed.
async function commit(
    ctx: ActionContext,
    dir: string,
    folder: "gadgets" | "protocols",
    name: string,
    source: string,
): Promise<void> {
    const path = join(dir, folder);
    await Bun.$`mkdir -p ${path}`.quiet();
    await Bun.write(join(path, `${name}.${folder === "gadgets" ? "ts" : "md"}`), source);
    await refresh(ctx, dir);
}

function coerceInput(input: unknown): { bad: string } | { bad: undefined; value: unknown } {
    if (input === undefined || input === null) return { bad: undefined, value: {} };
    if (typeof input !== "string") return { bad: undefined, value: input };

    try {
        return { bad: undefined, value: JSON.parse(input) };
    } catch {
        return { bad: "input must be a json object, not a string" };
    }
}

const NAME_KEYS = ["name", "gadget", "gadget_name"];

// A model reading only a gadget's description tends to hand its name back as one
// more input field, so the name is taken back out when the call left it empty.
function liftName(
    ctx: ActionContext,
    name: string,
    input: unknown,
): { name: string; input: unknown } {
    if (name || typeof input !== "object" || input === null || Array.isArray(input))
        return { name, input };

    const rest = { ...(input as Record<string, unknown>) };
    const key = NAME_KEYS.find(
        (candidate) =>
            typeof rest[candidate] === "string" && findIn(ctx, "gadget", String(rest[candidate])),
    );
    if (key === undefined) return { name, input };

    const lifted = String(rest[key]);
    delete rest[key];
    return { name: lifted, input: rest };
}

// A gadget and a protocol are the same shape on disk, so they are found the same
// way. The home comes back with it, because that is the one that has to be
// reloaded afterwards when something under it goes away.
function findIn(
    ctx: ActionContext,
    noun: "gadget" | "protocol",
    name: string,
): { dir: string; ref: GadgetRef } | undefined {
    for (const home of ctx.homes)
        for (const ref of noun === "gadget" ? home.gadgets : home.protocols)
            if (ref.name === name) return { dir: home.dir, ref };
    return undefined;
}

async function refresh(ctx: ActionContext, dir: string): Promise<void> {
    const refreshed = await Promise.all(
        ctx.homes.map((home) => (home.dir === dir ? loadHome(home.dir) : home)),
    );
    ctx.homes.splice(0, ctx.homes.length, ...refreshed);
}

async function runGadgetAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const coerced = coerceInput(args.input);
    if (coerced.bad !== undefined) return { ok: false, content: coerced.bad };
    const { name, input } = liftName(ctx, String(args.name ?? ""), coerced.value);

    const found = findIn(ctx, "gadget", name);
    if (!found) return { ok: false, content: `no gadget named "${name}"` };

    if (found.ref.ui && !ctx.ui)
        return {
            ok: false,
            content: prompt("gadget-draws", { name }),
        };

    const result = await runGadget(found.ref.file, input, ctx.ui, stateFor(ctx, found.dir));
    return { ok: result.ok, content: result.ok ? result.output : result.error };
}

async function loadAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
    noun: "gadget" | "protocol",
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const found = findIn(ctx, noun, name);
    if (!found) return { ok: false, content: `no ${noun} named "${name}"` };

    return { ok: true, content: await Bun.file(found.ref.file).text() };
}

async function createProtocolAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const source = writeProtocol(
        { name, description: String(args.description ?? ""), when: String(args.when ?? "") },
        String(args.content ?? ""),
    );
    const valid = validateProtocol(source);
    if (!valid.ok) return { ok: false, content: valid.error };

    const home = primaryHome(ctx);
    const existing = findIn(ctx, "protocol", name);
    const kind: ApprovalKind = existing ? "rewrite protocol" : "create protocol";

    const approved = await review(ctx.approve, { kind, name, source, reason: "" });
    if (!approved.ok) return { ok: false, content: approved.error };

    await commit(ctx, home, "protocols", name, source);

    return {
        ok: true,
        content: `protocol "${name}" ${existing ? "rewritten" : "committed"}. It is available from now on.`,
    };
}

async function createGadgetAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const source = String(args.source ?? "");
    const reason = String(args.reason ?? "");
    const prepared = await prepareGadget(source, reason, "create_gadget", ctx.ui);
    if (!prepared.ok) return prepared;
    const { draft } = prepared;

    try {
        const existing = findIn(ctx, "gadget", draft.name);
        const kind: ApprovalKind = existing ? "rewrite gadget" : "create gadget";

        const approved = await review(ctx.approve, { kind, name: draft.name, source, reason });
        if (!approved.ok) return { ok: false, content: approved.error };

        const home = primaryHome(ctx);
        await commit(ctx, home, "gadgets", draft.name, source);

        return {
            ok: true,
            content: `gadget "${draft.name}" ${existing ? "rewritten" : "created"} at ${join(home, "gadgets", `${draft.name}.ts`)}`,
        };
    } finally {
        await draft.dispose();
    }
}

async function testGadgetAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const input = coerceInput(args.input);
    if (input.bad !== undefined) return { ok: false, content: input.bad };

    const source = String(args.source ?? "");
    const reason = String(args.reason ?? "");
    const prepared = await prepareGadget(source, reason, "test_gadget", ctx.ui);
    if (!prepared.ok) return prepared;
    const { draft } = prepared;

    try {
        const approved = await review(ctx.approve, {
            kind: "test gadget",
            name: draft.name,
            source,
            reason,
        });
        if (!approved.ok) return { ok: false, content: approved.error };

        const result = await runGadget(
            draft.file,
            input.value,
            ctx.ui,
            stateFor(ctx, primaryHome(ctx)),
        );
        if (!result.ok) return { ok: false, content: result.error };

        return {
            ok: true,
            content: prompt("untested-gadget", { output: result.output, name: draft.name }),
        };
    } finally {
        await draft.dispose();
    }
}

async function deleteAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
    noun: "gadget" | "protocol",
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const found = findIn(ctx, noun, name);
    if (!found) return { ok: false, content: `no ${noun} named "${name}"` };

    const reason = String(args.reason ?? "").trim();
    if (!reason)
        return {
            ok: false,
            content: `delete_${noun} needs a \`reason\`: the user reads it to decide whether to let this go`,
        };

    const source = await Bun.file(found.ref.file).text();
    const approved = await review(ctx.approve, { kind: `delete ${noun}`, name, source, reason });
    if (!approved.ok) return { ok: false, content: approved.error };

    await Bun.file(found.ref.file).delete();
    await refresh(ctx, found.dir);

    return { ok: true, content: `${noun} "${name}" deleted from ${found.dir}` };
}

export async function runAction(
    action: string,
    args: Record<string, unknown>,
    ctx: ActionContext,
): Promise<ActionResult> {
    if (ctx.mode === "work" && GROWS.includes(action))
        return {
            ok: false,
            content: prompt("learn-only-action", { action }),
        };

    switch (action) {
        case "run_gadget":
            return await runGadgetAction(ctx, args);
        case "test_gadget":
            return await testGadgetAction(ctx, args);
        case "load_gadget":
            return await loadAction(ctx, args, "gadget");
        case "load_protocol":
            return await loadAction(ctx, args, "protocol");
        case "load_ui":
            return { ok: true, content: UI_LANGUAGE };
        case "create_protocol":
            return await createProtocolAction(ctx, args);
        case "create_gadget":
            return await createGadgetAction(ctx, args);
        case "delete_gadget":
            return await deleteAction(ctx, args, "gadget");
        case "delete_protocol":
            return await deleteAction(ctx, args, "protocol");
        default:
            return {
                ok: false,
                content: `unknown action "${action}". Available: ${actionsFor(ctx.mode ?? DEFAULT_MODE).join(", ")}`,
            };
    }
}
