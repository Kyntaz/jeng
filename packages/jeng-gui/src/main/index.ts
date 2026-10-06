import { listSessions, readSession } from "@jeng/core";
import type { Conversation, Session } from "@jeng/view";
import { app, Utils } from "electrobun/main";
import type { Applied } from "..";
import { open } from "./open";
import { forget, serve } from "./server";
import { discoverConfigs, readSettings, type Settings, saveSettings } from "./settings";
import { openWindow } from "./window";

/**
 * The window is launched from an app launcher, so nothing about it is a flag: the config
 * and the directory it works in are the ones it remembered, and it starts in whatever
 * folder it was launched from.
 */
const remembered = await readSettings(process.cwd());
let talk = await open(remembered);
let settings = await discoverConfigs(remembered, talk.get());

// The window asks for the state once it is listening, because nothing before that would
// have anywhere to go, and is handed every change after it.
let listening = false;
let unwatch = () => {};

async function set(next: Settings, resume?: Session): Promise<Applied> {
    const wanted = {
        ...next,
        configs:
            next.config && !next.configs.includes(next.config)
                ? [...next.configs, next.config]
                : next.configs,
    };

    let opened: Conversation;
    try {
        opened = await open(wanted, { resume, mode: talk.get().mode });
    } catch (error) {
        // A config that cannot be read leaves the window on the one it had, which is the
        // only thing a picker can do about a file it does not understand.
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            configs: settings.configs,
        };
    }

    // A turn in flight is writing to homes this is about to stop being, and what it said is
    // a conversation somebody may want back, so it is written down on the way out.
    talk.escape();
    talk.save();
    settings = wanted;
    talk = opened;
    // The old conversation's gadgets go with it: nothing left on screen is drawing them.
    forget();
    watch();
    // Nobody has said anything since the swap, so the new state has to be handed over
    // rather than waited for: the window is holding the old one until it is told.
    if (listening) window.state(talk.get());
    await saveSettings(settings);
    return { ok: true, configs: settings.configs };
}

/**
 * A session names the run it was, so opening one points the window at that directory and
 * that config file as well as handing back the conversation. The window's own list of
 * configs is kept, since those were chosen by the user rather than by the session.
 */
async function resume(id: string): Promise<Applied> {
    let session: Session;
    try {
        session = readSession<Session>(talk.get().homes[0], id);
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            configs: settings.configs,
        };
    }
    return await set({ ...settings, cwd: session.cwd, config: session.config }, session);
}

/**
 * The system's own dialog. No file type filter, because a config is not obliged to be
 * called `.json` — the one this window keeps its list in has no extension at all — and a
 * picker that hides the file you wanted is worse than one showing a few extra. Electrobun
 * wants a comma separated list of extensions without dots here, so a filter is also the
 * wrong shape to reach for in a hurry.
 */
async function pick(directory: boolean): Promise<string | undefined> {
    const [path] = await Utils.openFileDialog({
        startingFolder: settings.cwd,
        canChooseFiles: !directory,
        canChooseDirectory: directory,
        allowsMultipleSelection: false,
    });
    return path;
}

/** Picking nothing is not a change, so the picker asks for a file and then applies it. */
async function browse(key: "config" | "cwd"): Promise<Applied> {
    const picked = await pick(key === "cwd");
    if (!picked) return { ok: true, configs: settings.configs };
    return await set({ ...settings, [key]: picked });
}

const site = serve();
const window = openWindow(site.url, {
    ready: () => {
        listening = true;
        return { state: talk.get(), configs: settings.configs };
    },
    set: async (next) => await set({ ...settings, ...next }),
    forget: (path) => {
        settings = { ...settings, configs: settings.configs.filter((known) => known !== path) };
        void saveSettings(settings);
        return { ok: true, configs: settings.configs };
    },
    browseConfig: async () => await browse("config"),
    browseCwd: async () => await browse("cwd"),
    sessions: () => listSessions(talk.get().homes[0]),
    resume,
    send: (text) => {
        void talk.send(text);
        return { sent: Boolean(text.trim()) };
    },
    interrupt: () => talk.escape(),
    clear: () => talk.clear(),
    setMode: (mode) => {
        if (talk.get().mode !== mode) talk.toggleMode();
    },
    toggleThinking: () => talk.toggleThinking(),
    answer: (id, answers) => talk.answer(id, answers),
    abandon: (id) => talk.abandon(id),
    decide: (decision) => talk.decide(decision),
});

function watch(): void {
    unwatch();
    unwatch = talk.subscribe(() => {
        if (listening) window.state(talk.get());
    });
}

watch();

// The server is the only thing in this process holding an event loop open, and
// Electrobun waits for that loop to drain before letting the process exit, so a window
// closed with the server still listening hangs on the way out rather than quitting.
// Both the window closing and a quit from anywhere else go through here, and stopping a
// server that has already stopped is a no-op, so the two overlap harmlessly. The
// conversation is written down on the way out, since a window closed is a run that ended.
const stop = () => {
    talk.save();
    site.stop();
};
window.onClose(stop);
app.on("before-quit", stop);
