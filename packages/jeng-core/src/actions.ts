import { join } from "node:path";
import { type ApprovalKind, type Approve, review } from "./approve";
import { prepareGadget } from "./draft";
import { runGadget } from "./gadget";
import { writeProtocol } from "./header";
import { type GadgetRef, type Home, loadHome } from "./home";
import { DEFAULT_MODE, GROWS, type Mode } from "./mode";
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

const NAME_KEYS = ["name", "gadget", "gadget_name"];

// A model reading only a gadget's description tends to hand its name back as one
// more input field, so the name is taken back out when the call left it empty. An
// explicit name is never overridden, and one that matches no gadget is left alone
// for the error to name.
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

    // Offering a gadget that draws and then refusing it to run would be a waste of
    // a turn, so the run without a UI says so rather than pretending the call can work.
    if (found.ref.ui && !ctx.ui)
        return {
            ok: false,
            content: `gadget "${name}" draws its own interface, which this run has nowhere to show it. Say so with end instead.`,
        };

    const result = await runGadget(found.ref.file, input, ctx.ui);
    return { ok: result.ok, content: result.ok ? result.output : result.error };
}

async function loadProtocolAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const found = findIn(ctx, "protocol", name);
    if (!found) return { ok: false, content: `no protocol named "${name}"` };

    return { ok: true, content: await Bun.file(found.ref.file).text() };
}

async function createProtocolAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    const name = String(args.name ?? "");
    if (findIn(ctx, "protocol", name))
        return { ok: false, content: `protocol "${name}" already exists` };

    const source = writeProtocol(
        { name, description: String(args.description ?? ""), when: String(args.when ?? "") },
        String(args.content ?? ""),
    );
    const valid = validateProtocol(source);
    if (!valid.ok) return { ok: false, content: valid.error };

    const home = primaryHome(ctx);
    const dir = join(home, "protocols");

    // A protocol is only text, so there is nothing to justify; the user is
    // confirming the memory is right rather than judging how it worded itself.
    const approved = await review(ctx.approve, {
        kind: "create protocol",
        name,
        source,
        reason: "",
    });
    if (!approved.ok) return { ok: false, content: approved.error };

    await Bun.$`mkdir -p ${dir}`.quiet();
    await Bun.write(join(dir, `${name}.md`), source);
    await refresh(ctx, home);

    return { ok: true, content: `protocol "${name}" committed. It is available from now on.` };
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
        // The model cannot edit files, so rewriting a gadget it is unhappy with is
        // the only way it can fix one. Validation has already passed either way.
        const existing = findIn(ctx, "gadget", draft.name);
        const kind: ApprovalKind = existing ? "rewrite gadget" : "create gadget";

        const approved = await review(ctx.approve, { kind, name: draft.name, source, reason });
        if (!approved.ok) return { ok: false, content: approved.error };

        const home = primaryHome(ctx);
        const dir = join(home, "gadgets");
        await Bun.$`mkdir -p ${dir}`.quiet();
        await Bun.write(join(dir, `${draft.name}.ts`), source);
        await refresh(ctx, home);

        return {
            ok: true,
            content: existing
                ? `gadget "${draft.name}" rewritten at ${join(dir, `${draft.name}.ts`)}`
                : `gadget "${draft.name}" created at ${join(dir, `${draft.name}.ts`)}`,
        };
    } finally {
        await draft.dispose();
    }
}

async function testGadgetAction(
    ctx: ActionContext,
    args: Record<string, unknown>,
): Promise<ActionResult> {
    // Asked about before anyone is, because a run that cannot happen is not worth
    // a user's time to read a gadget over.
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

        const result = await runGadget(draft.file, input.value, ctx.ui);
        if (!result.ok) return { ok: false, content: result.error };

        return {
            ok: true,
            content: `${result.output}\n\n(gadget "${draft.name}" ran but was not saved. Commit this same source with create_gadget once it is right.)`,
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

    // Nothing else about a deletion can be undone, so a model that cannot say why
    // this one should go is turned down before the user is asked to weigh in.
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
    // Work mode never offers these, so a call that names one anyway is a model
    // reaching for something this run has no way to give it.
    if (ctx.mode === "work" && GROWS.includes(action))
        return {
            ok: false,
            content: `"${action}" is a learn-mode action and this run cannot change the home. Use what you have, or end and say what is missing.`,
        };

    switch (action) {
        case "run_gadget":
            return await runGadgetAction(ctx, args);
        case "test_gadget":
            return await testGadgetAction(ctx, args);
        case "load_protocol":
            return await loadProtocolAction(ctx, args);
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
