import { type Approve, createAgent, loadConfig } from "@jeng/core";
import { createConversation } from "@jeng/view";
import { app } from "electrobun/main";
import { serve } from "./server";
import { openWindow } from "./window";

// The window is the whole interface, so there is nothing here for a flag to change: the
// homes and the model come from the config file and the environment exactly as they do
// for the terminal, which is also what `jeng --home` would have said.
const config = await loadConfig();

// Nothing is approved before the window exists to ask, which is the same reason a piped
// terminal run will not write to a home without being told to.
const noone: Approve = async () => ({
    approved: false,
    reason: "there is no window to approve on",
});

const agent = await createAgent({
    homes: config.homes,
    config: config.model,
    approve: noone,
});
const talk = createConversation(agent);

// A gadget that draws a react component is compiled and mounted in the window, so this
// is the port that makes a run anything but headless. It is the same call a widget tree
// gets, with the props in place of the widget.
agent.setGui((file, props) => talk.ask({ surface: "gui", file, props }));

// The window asks for the state once it is listening, because nothing before that would
// have anywhere to go, and is handed every change after it.
let listening = false;
const site = serve();
const window = openWindow(site.url, {
    ready: () => {
        listening = true;
        return talk.get();
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

talk.subscribe(() => {
    if (listening) window.state(talk.get());
});

// The server is the only thing in this process holding an event loop open, and
// Electrobun waits for that loop to drain before letting the process exit, so a window
// closed with the server still listening hangs on the way out rather than quitting.
// Both the window closing and a quit from anywhere else go through here, and stopping a
// server that has already stopped is a no-op, so the two overlap harmlessly.
const stop = () => site.stop();
window.onClose(stop);
app.on("before-quit", stop);
