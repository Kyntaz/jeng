import { dirname, join } from "node:path";
import { type ApprovalKind, type Approve, review } from "./approve";
import { type Draft, prepareGadget } from "./draft";
import { type Ports, runGadget } from "./gadget";
import { GUI_LANGUAGE, type Gui } from "./gui";
import { writeProtocol } from "./header";
import { type GadgetRef, gadgetFile, type Home, loadHome } from "./home";
import { DEFAULT_MODE, GROWS, type Mode } from "./mode";
import { prompt } from "./prompts";
import { persistentState, type State, type StateMap } from "./state";
import { actionsFor } from "./tool";
import { type Surface, UI_LANGUAGE, type Ui } from "./ui";
import { validateProtocol } from "./validate";

type Args = Record<string, unknown>;
type ActionResult = { ok: boolean; content: string };

type Noun = "gadget" | "protocol";

/** The home a thing came from travels with it, because that is the one to reload afterwards. */
type Found = { dir: string; ref: GadgetRef };

export interface ActionContext {
    homes: Home[];
    cwd: string;
    approve: Approve;
    /** Absent wherever there is no interface to draw on, which is what makes a run headless. */
    ui?: Ui;
    /** The same, for a gadget that draws a react component rather than a widget tree. */
    gui?: Gui;
    mode?: Mode;
    session: StateMap;
}

/**
 * Which surface a run can draw in, which is whichever port the host took. Absent is a
 * headless run, and a headless run draws nothing at all.
 */
export const surfaceOf = (ctx: ActionContext): Surface | undefined =>
    ctx.gui ? "gui" : ctx.ui ? "tui" : undefined;

// A gadget is offered, and run, only where the surface it declared can show it.
const drawsElsewhere = (ref: GadgetRef, surface: Surface | undefined): boolean =>
    ref.ui ? surface !== "tui" : ref.gui ? surface !== "gui" : false;

/**
 * The one port a gadget is handed. Which one is not a matter of taste at run time: the
 * header already said, and the gates above have refused anything the surface cannot show.
 */
const portsFor = (ctx: ActionContext, gui: boolean): Ports =>
    gui ? { gui: ctx.gui } : { ui: ctx.ui };

const primaryHome = (ctx: ActionContext) => ctx.homes[0]?.dir ?? join(ctx.cwd, ".jeng");

// A gadget keeps what it commits in the home it came from, and its session is the
// run's whichever home that is.
const stateFor = (ctx: ActionContext, dir: string): State => ({
    session: ctx.session,
    persistent: persistentState(dir),
});

// The model cannot edit files, so a name that is taken is rewritten rather than refused.
const memory = (noun: Noun, existing: boolean): ApprovalKind =>
    existing ? `rewrite ${noun}` : `create ${noun}`;

// The home is only ever written to once the user has agreed.
async function commit(
    ctx: ActionContext,
    dir: string,
    file: string,
    source: string,
): Promise<void> {
    await Bun.$`mkdir -p ${dirname(file)}`.quiet();
    await Bun.write(file, source);
    await refresh(ctx, dir);
}

/**
 * A model that quotes its json tends to quote a list inside it too, so a string that
 * parses as json is taken apart before a gadget is handed it. Nothing is lost by
 * trying, because a string that does not parse is left exactly as it was.
 */
function unwrap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(unwrap);
    if (typeof value === "object" && value !== null)
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrap(item)]));
    if (typeof value !== "string") return value;
    try {
        return unwrap(JSON.parse(value));
    } catch {
        return value;
    }
}

const kindOf = (value: unknown): string =>
    Array.isArray(value) ? "a list" : value === null ? "null" : `a ${typeof value}`;

/**
 * What a gadget is handed is always an object, which is what the tool says `input` is.
 * Absent input is the same as none at all, and anything else is refused rather than
 * passed on, so a call that got its shape wrong is told so instead of tripping the
 * gadget over its own arguments.
 */
function coerceInput(
    input: unknown,
): { bad: string } | { bad: undefined; input: Record<string, unknown> } {
    const value = input === undefined || input === null ? {} : unwrap(input);
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return { bad: `input must be a json object, not ${kindOf(value)}` };
    return { bad: undefined, input: value as Record<string, unknown> };
}

function findIn(ctx: ActionContext, noun: Noun, name: string): Found | undefined {
    for (const home of ctx.homes)
        for (const ref of noun === "gadget" ? home.gadgets : home.protocols)
            if (ref.name === name) return { dir: home.dir, ref };
    return undefined;
}

const named = (
    ctx: ActionContext,
    noun: Noun,
    args: Args,
): { bad: string } | { bad: undefined; found: Found } => {
    const name = String(args.name ?? "");
    const found = findIn(ctx, noun, name);
    return found ? { bad: undefined, found } : { bad: `no ${noun} named "${name}"` };
};

async function refresh(ctx: ActionContext, dir: string): Promise<void> {
    const refreshed = await Promise.all(
        ctx.homes.map((home) => (home.dir === dir ? loadHome(home.dir) : home)),
    );
    ctx.homes.splice(0, ctx.homes.length, ...refreshed);
}

async function runGadgetAction(ctx: ActionContext, args: Args): Promise<ActionResult> {
    const given = coerceInput(args.input);
    if (given.bad !== undefined) return { ok: false, content: given.bad };

    const hit = named(ctx, "gadget", args);
    if (hit.bad !== undefined) return { ok: false, content: hit.bad };
    const { dir, ref } = hit.found;

    if (drawsElsewhere(ref, surfaceOf(ctx)))
        return { ok: false, content: prompt("gadget-draws", { name: ref.name }) };

    const result = await runGadget(
        ref.file,
        given.input,
        portsFor(ctx, ref.gui),
        stateFor(ctx, dir),
    );
    return { ok: result.ok, content: result.ok ? result.output : result.error };
}

async function loadAction(ctx: ActionContext, args: Args, noun: Noun): Promise<ActionResult> {
    const hit = named(ctx, noun, args);
    if (hit.bad !== undefined) return { ok: false, content: hit.bad };
    return { ok: true, content: await Bun.file(hit.found.ref.file).text() };
}

async function deleteAction(ctx: ActionContext, args: Args, noun: Noun): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const hit = named(ctx, noun, args);
    if (hit.bad !== undefined) return { ok: false, content: hit.bad };
    const { dir, ref } = hit.found;

    const reason = String(args.reason ?? "").trim();
    if (!reason)
        return {
            ok: false,
            content: `delete_${noun} needs a \`reason\`: the user reads it to decide whether to let this go`,
        };

    const source = await Bun.file(ref.file).text();
    const approved = await review(ctx.approve, { kind: `delete ${noun}`, name, source, reason });
    if (!approved.ok) return approved;

    await Bun.file(ref.file).delete();
    await refresh(ctx, dir);

    return { ok: true, content: `${noun} "${name}" deleted from ${dir}` };
}

async function createProtocolAction(ctx: ActionContext, args: Args): Promise<ActionResult> {
    const name = String(args.name ?? "");
    const source = writeProtocol(
        { name, description: String(args.description ?? ""), when: String(args.when ?? "") },
        String(args.content ?? ""),
    );
    const valid = validateProtocol(source);
    if (!valid.ok) return { ok: false, content: valid.error };

    const existing = findIn(ctx, "protocol", name);
    const approved = await review(ctx.approve, {
        kind: memory("protocol", existing !== undefined),
        name,
        source,
        reason: "",
    });
    if (!approved.ok) return approved;

    const home = primaryHome(ctx);
    await commit(ctx, home, join(home, "protocols", `${name}.md`), source);

    return {
        ok: true,
        content: `protocol "${name}" ${existing ? "rewritten" : "committed"}. It is available from now on.`,
    };
}

/**
 * A draft is prepared, handed over and thrown away in one place, so that no action can
 * leave the folder a `test_gadget` was run out of behind it.
 */
async function withDraft(
    ctx: ActionContext,
    args: Args,
    action: string,
    body: (draft: Draft, source: string, reason: string) => Promise<ActionResult>,
): Promise<ActionResult> {
    const source = String(args.source ?? "");
    const reason = String(args.reason ?? "");
    const prepared = await prepareGadget(source, reason, action, surfaceOf(ctx));
    if (!prepared.ok) return prepared;
    try {
        return await body(prepared.draft, source, reason);
    } finally {
        await prepared.draft.dispose();
    }
}

async function createGadgetAction(ctx: ActionContext, args: Args): Promise<ActionResult> {
    return await withDraft(ctx, args, "create_gadget", async (draft, source, reason) => {
        const existing = findIn(ctx, "gadget", draft.name);
        const approved = await review(ctx.approve, {
            kind: memory("gadget", existing !== undefined),
            name: draft.name,
            source,
            reason,
        });
        if (!approved.ok) return approved;

        const home = primaryHome(ctx);
        const file = gadgetFile(home, draft.name, draft.header);
        await commit(ctx, home, file, source);

        return {
            ok: true,
            content: `gadget "${draft.name}" ${existing ? "rewritten" : "created"} at ${file}`,
        };
    });
}

async function testGadgetAction(ctx: ActionContext, args: Args): Promise<ActionResult> {
    const given = coerceInput(args.input);
    if (given.bad !== undefined) return { ok: false, content: given.bad };

    return await withDraft(ctx, args, "test_gadget", async (draft, source, reason) => {
        const approved = await review(ctx.approve, {
            kind: "test gadget",
            name: draft.name,
            source,
            reason,
        });
        if (!approved.ok) return approved;

        const result = await runGadget(
            draft.file,
            given.input,
            portsFor(ctx, draft.header.gui === "true"),
            stateFor(ctx, primaryHome(ctx)),
        );
        if (!result.ok) return { ok: false, content: result.error };

        return {
            ok: true,
            content: prompt("untested-gadget", { output: result.output, name: draft.name }),
        };
    });
}

const HANDLERS: Record<string, (ctx: ActionContext, args: Args) => Promise<ActionResult>> = {
    run_gadget: runGadgetAction,
    test_gadget: testGadgetAction,
    load_gadget: (ctx, args) => loadAction(ctx, args, "gadget"),
    load_protocol: (ctx, args) => loadAction(ctx, args, "protocol"),
    load_ui: async (ctx) => ({
        ok: true,
        content: surfaceOf(ctx) === "gui" ? GUI_LANGUAGE : UI_LANGUAGE,
    }),
    create_protocol: createProtocolAction,
    create_gadget: createGadgetAction,
    delete_gadget: (ctx, args) => deleteAction(ctx, args, "gadget"),
    delete_protocol: (ctx, args) => deleteAction(ctx, args, "protocol"),
};

export async function runAction(
    action: string,
    args: Args,
    ctx: ActionContext,
): Promise<ActionResult> {
    if (ctx.mode === "work" && GROWS.includes(action))
        return { ok: false, content: prompt("learn-only-action", { action }) };

    const handler = HANDLERS[action];
    if (!handler)
        return {
            ok: false,
            content: `unknown action "${action}". Available: ${actionsFor(ctx.mode ?? DEFAULT_MODE).join(", ")}`,
        };
    return await handler(ctx, args);
}
