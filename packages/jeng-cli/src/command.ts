#!/usr/bin/env bun
import { createInterface, type Interface } from "node:readline";
import {
    type Approval,
    type ApprovalDecision,
    type Approve,
    type Config,
    createAgent,
    isDelete,
    isMode,
    listSessions,
    loadConfig,
    type Mode,
    readSession,
    sessionId,
    writeSession,
} from "@jeng/core";
import { createConversation, type Session, type Sessioning } from "@jeng/view";
import { Command } from "commander";
import { approvalText, dress, type Run, renderTui } from "./tui";

interface Options {
    home: string[];
    config: string | undefined;
    yes: boolean;
    mode?: Mode;
    maxTurns?: number;
    session?: string;
    sessions?: boolean;
}

const collect = (value: string, previous: string[]) => [...previous, value];

// A piped prompt is only read when no argument was given, because reading stdin
// blocks until whoever holds the pipe closes it.
async function piped(): Promise<string> {
    if (process.stdin.isTTY) return "";
    return await Bun.stdin.text();
}

function die(message: string): never {
    process.stderr.write(`${message}\n`);
    process.exit(1);
}

// One-shot has no modal, so the whole request goes to stderr and the answer comes
// back as a single line: nothing typed approves, anything typed is why it was
// turned down.
let ask: Interface | undefined;

async function askOnStdin(request: Approval): Promise<ApprovalDecision> {
    if (!process.stdin.isTTY)
        return {
            approved: false,
            reason: "there is no terminal to approve on, so nothing was reviewed",
        };

    ask ??= createInterface({ input: process.stdin, output: process.stderr });
    process.stderr.write(`\n⚑ ${approvalText(request)}\n`);

    // A terminal that cannot be read is not consent, so a failed read turns the
    // gadget down rather than letting it through unreviewed.
    const reason = (
        await new Promise<string>((resolve) => {
            try {
                ask?.question("enter to approve, or write why to reject > ", resolve);
            } catch {
                resolve("the prompt could not be read");
            }
        })
    ).trim();

    return reason ? { approved: false, reason } : { approved: true };
}

// --yes answers for anything that runs code, but never for a deletion: a scripted
// run should not be able to throw a home away that nobody was there to see go.
const yes: Approve = async (request) =>
    isDelete(request.kind) ? await askOnStdin(request) : { approved: true };

const approve = (options: Options): Approve => (options.yes ? yes : askOnStdin);

/**
 * A session carries the run it was: the directory, the homes, the config file and the mode
 * it was working under. So a session is read out of the first home a run would use, which
 * is where it is kept, and the flags that would name a different run are refused rather
 * than quietly dropped.
 */
async function restored(options: Options): Promise<Session> {
    if (options.config || options.home.length > 0 || options.mode !== undefined)
        die(
            "a session carries its own config, homes and mode: leave --config, --home and --mode off, or start without --session",
        );

    try {
        return readSession<Session>((await configFor(options)).homes[0], options.session ?? "");
    } catch (error) {
        die(error instanceof Error ? error.message : String(error));
    }
}

async function configFor(options: Options, resume?: Session): Promise<Config> {
    try {
        return await loadConfig({
            // A resumed run brought its own config, so it is the one read rather than found.
            path: resume?.config ?? options.config,
            cwd: resume?.cwd,
            // Which is the same precedence a flag has over the homes a config file lists.
            homeArgs: resume ? resume.homes : options.home,
        });
    } catch (error) {
        die(error instanceof Error ? error.message : String(error));
    }
}

/**
 * A list of sessions is read rather than searched, so it is one line each and newest
 * first: this is what is read before `--session <id>`.
 */
function listed(home: string): void {
    const sessions = listSessions(home);
    if (sessions.length === 0) {
        process.stdout.write("no sessions yet\n");
        return;
    }

    for (const session of sessions) {
        const when = new Date(session.updated).toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
        });
        process.stdout.write(`${when}  ${session.id}  ${session.title || "nothing said yet"}\n`);
    }
}

async function open(options: Options, resume?: Session): Promise<Run> {
    // A mode that is not one is a typo rather than a mode, and quietly
    // falling back to learn would hand the user an agent that writes.
    if (options.mode !== undefined && !isMode(options.mode))
        die(`mode must be learn or work, not ${options.mode}`);

    // A limit is the user taking the ability to interrupt back, so a
    // nonsense one has to be said rather than clamped.
    if (
        options.maxTurns !== undefined &&
        (!Number.isInteger(options.maxTurns) || options.maxTurns < 1)
    )
        die(`max-turns must be a whole number above zero, not ${options.maxTurns}`);

    const config = await configFor(options, resume);
    const agent = await createAgent({
        cwd: resume?.cwd,
        homes: config.homes,
        config: config.model,
        history: resume?.history,
        memory: resume?.memory,
        tokens: resume?.tokens,
        mode: resume?.mode ?? options.mode,
        maxTurns: options.maxTurns,
        // --yes never installs the reader on its own, so a scripted run
        // touches no stdin unless it has something to delete.
        approve: approve(options),
    });

    // The style goes on before the TUI is rendered and before the agent could put anything
    // on screen, since it is read at draw time rather than handed down. A run that resumes
    // a session brings its own config, so this happens on that path too.
    dress(config.style);

    // Sessions belong to the home a run was given first, which is the one whose agent this
    // is: a second home is another agent's memory rather than somewhere this one's
    // conversations go.
    const home = config.homes[0];
    const sessioning: Sessioning = {
        ...(resume ? { resume } : {}),
        name: () => sessionId(),
        save: (session) => {
            writeSession(home, session);
        },
    };

    return {
        agent,
        talk: createConversation(agent, config.path, sessioning),
        home,
        sessions: () => listSessions(home),
    };
}

async function once({ agent, talk }: Run, prompt: string, options: Options): Promise<void> {
    try {
        // Nobody is here to answer an approval the conversation put up for a frontend that
        // does not exist, so the terminal's own reader goes back in.
        agent.setApprove(approve(options));
        let streamed = "";
        const reply = await agent.send(prompt, {
            onEvent: (event) => {
                if (event.type === "text") {
                    streamed += event.text;
                    process.stdout.write(event.text);
                }
                if (event.type === "tool") process.stderr.write(`\n⚙ ${event.action}\n`);
                if (event.type === "result") process.stderr.write(`↳ ${event.content}\n`);
            },
        });
        // An end with nothing in it has already been said, so there is no answer to
        // write out again and no blank line to leave behind.
        if (reply.trim() && reply.trim() !== streamed.trim())
            process.stdout.write(`${streamed.trim() ? "\n" : ""}${reply}`);
        process.stdout.write("\n");
    } finally {
        // Held stdin keeps the process alive, and a turn with nothing to ask about
        // never opened one in the first place.
        ask?.close();
        ask = undefined;
        talk.save();
    }
}

export async function jeng(): Promise<void> {
    await new Command()
        .name("jeng")
        .description("An agent for you.")
        .argument(
            "[prompt...]",
            "run a single prompt and exit instead of opening the TUI; read from stdin when piped in",
        )
        .option("--home <dir>", "home folder; repeat for multiple agents", collect, [])
        .option(
            "--mode <mode>",
            "learn to grow the home, work to use only what it already has; defaults to learn",
        )
        .option(
            "-c, --config <file>",
            "configuration file; defaults to ./jeng.json, then <home>/jeng.json",
        )
        .option(
            "--max-turns <turns>",
            "stop a turn after this many model calls; unbounded by default",
            Number,
        )
        .option(
            "-y, --yes",
            "approve every gadget and protocol without asking; a deletion is always asked for",
        )
        .option("--session <id>", "start on a session that was saved before; see --sessions")
        .option("--sessions", "list the sessions kept in the first home, newest first")
        .showHelpAfterError()
        .action(async (prompt: string[], options: Options) => {
            if (options.sessions) {
                if (options.session) die("--sessions lists them and --session opens one: pick one");
                listed((await configFor(options)).homes[0]);
                return;
            }

            const run = await open(options, options.session ? await restored(options) : undefined);
            const text = prompt.length ? prompt.join(" ") : await piped();
            if (text.trim()) await once(run, text, options);
            else if (process.stdin.isTTY)
                await renderTui(run, async (id, from) => {
                    // The conversation being left is one somebody may want back, so it is
                    // written down before the one being opened rather than after. Which home
                    // the session is read out of is the one the run being left was writing to.
                    from.talk.save();
                    return await open(options, readSession<Session>(from.home, id));
                });
            else die("no prompt given, on the argument or on stdin");
        })
        .parseAsync();
}
