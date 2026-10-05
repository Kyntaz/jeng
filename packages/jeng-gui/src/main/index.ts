import {
    type Approve,
    configPaths,
    createAgent,
    defaultHome,
    loadConfig,
    type Mode,
} from "@jeng/core";
import { type Conversation, createConversation } from "@jeng/view";
import { app, Utils } from "electrobun/main";
import type { Applied } from "../rpc";
import { serve } from "./server";
import { readSettings, type Settings, saveSettings } from "./settings";
import { openWindow } from "./window";

// Nothing is approved before the window exists to ask, which is the same reason a piped
// terminal run will not write to a home without being told to.
const noone: Approve = async () => ({
    approved: false,
    reason: "there is no window to approve on",
});

/**
 * The window is launched from an app launcher, so nothing about it is a flag: the config
 * and the directory it works in are the ones it remembered, and it starts in whatever
 * folder it was launched from.
 */
let settings = await readSettings(process.cwd());
let talk = await open(settings);

// Nothing has been picked yet, so the list is whatever jeng can already find. A window
// started from a launcher has no `./jeng.json` of its own to fall back on.
if (settings.config === undefined && !settings.configs.length) {
    const state = talk.get();
    settings = {
        ...settings,
        config: state.config,
        configs: [
            ...new Set([
                ...(await configPaths(state.cwd, state.homes[0] ?? defaultHome())),
                ...(state.config ? [state.config] : []),
            ]),
        ],
    };
    await saveSettings(settings);
}

/**
 * Homes, model and the AGENTS.md chain are all settled when an agent is built, so applying
 * a config or a directory means building another one rather than editing the one in hand.
 * The mode carries over, because dropping from work to learn would hand back the ability
 * to write to a home.
 */
async function open(from: Settings, mode?: Mode): Promise<Conversation> {
    const config = await loadConfig({ path: from.config, cwd: from.cwd });
    const agent = await createAgent({
        cwd: from.cwd,
        homes: config.homes,
        config: config.model,
        mode,
        approve: noone,
    });
    const conversation = createConversation(agent, config.path);
    // A gadget that draws a react component is compiled and mounted in the window, so this
    // is the port that makes a run anything but headless.
    agent.setGui((file, props) => conversation.ask({ surface: "gui", file, props }));
    return conversation;
}

// The window asks for the state once it is listening, because nothing before that would
// have anywhere to go, and is handed every change after it.
let listening = false;
let unwatch = () => {};

async function set(next: Settings): Promise<Applied> {
    const wanted = {
        ...next,
        configs:
            next.config && !next.configs.includes(next.config)
                ? [...next.configs, next.config]
                : next.configs,
    };

    let opened: Conversation;
    try {
        opened = await open(wanted, talk.get().mode);
    } catch (error) {
        // A config that cannot be read leaves the window on the one it had, which is the
        // only thing a picker can do about a file it does not understand.
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            configs: settings.configs,
        };
    }

    // A turn in flight is writing to homes this is about to stop being.
    talk.escape();
    settings = wanted;
    talk = opened;
    watch();
    // Nobody has said anything since the swap, so the new state has to be handed over
    // rather than waited for: the window is holding the old one until it is told.
    if (listening) window.state(talk.get());
    await saveSettings(settings);
    return { ok: true, configs: settings.configs };
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
    browseConfig: async () => {
        const config = await pick(false);
        return config
            ? await set({ ...settings, config })
            : { ok: true, configs: settings.configs };
    },
    browseCwd: async () => {
        const cwd = await pick(true);
        return cwd ? await set({ ...settings, cwd }) : { ok: true, configs: settings.configs };
    },
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

watch();

// The server is the only thing in this process holding an event loop open, and
// Electrobun waits for that loop to drain before letting the process exit, so a window
// closed with the server still listening hangs on the way out rather than quitting.
// Both the window closing and a quit from anywhere else go through here, and stopping a
// server that has already stopped is a no-op, so the two overlap harmlessly.
const stop = () => site.stop();
window.onClose(stop);
app.on("before-quit", stop);
