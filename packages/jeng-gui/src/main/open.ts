import { existsSync } from "node:fs";
import {
    type Approve,
    createAgent,
    loadConfig,
    type Mode,
    type Style,
    sessionId,
    writeSession,
} from "@jeng/core";
import { type Conversation, createConversation, type Session } from "@jeng/view";
import { keep } from "./server";
import type { Settings } from "./settings";

// Nothing is approved before the window exists to ask, which is the same reason a piped
// terminal run will not write to a home without being told to.
const noone: Approve = async () => ({
    approved: false,
    reason: "there is no window to approve on",
});

/** What a run is opened with: a conversation to pick back up, or nothing but the window's own. */
interface Opening {
    resume?: Session;
    /** Carried across when there is no session to carry it, since dropping from work to learn
     *  would quietly hand back the ability to write to a home. */
    mode?: Mode;
}

/**
 * A transcript outlives the folder a throwaway gadget was run out of: a `test_gadget` lives
 * in a temp folder that is removed the moment the turn is over, and what it drew was only
 * ever held in memory. So a record of a component whose file is gone cannot be drawn again,
 * and it is left out rather than left in as a card that will not build.
 */
function drawable(session: Session): Session {
    return {
        ...session,
        entries: session.entries.filter(
            (entry) =>
                entry.kind !== "view" ||
                entry.draw.surface !== "gui" ||
                existsSync(entry.draw.file),
        ),
    };
}

/**
 * Homes, model and the AGENTS.md chain are all settled when an agent is built, so applying
 * a config or a directory means building another one rather than editing the one in hand.
 *
 * A session is that with a conversation behind it: it carries the cwd, the homes, the
 * config and the mode the run it was had, and everything it is written to is kept in the
 * first of those homes.
 *
 * The style is handed back rather than applied here because the window draws nothing: it
 * reaches the page through the stylesheet the server serves, which is built out of this.
 */
export async function open(
    from: Settings,
    opening: Opening = {},
): Promise<{ conversation: Conversation; style: Style }> {
    const session = opening.resume ? drawable(opening.resume) : undefined;
    const config = await loadConfig({
        path: session?.config ?? from.config,
        cwd: session?.cwd ?? from.cwd,
        // Which is the same precedence a picked home has over the ones a config file lists.
        homeArgs: session?.homes,
    });
    const agent = await createAgent({
        cwd: session?.cwd ?? from.cwd,
        homes: config.homes,
        config: config.model,
        history: session?.history,
        memory: session?.memory,
        tokens: session?.tokens,
        mode: session?.mode ?? opening.mode,
        approve: noone,
    });

    const home = config.homes[0];
    const conversation = createConversation(agent, config.path, {
        ...(session ? { resume: session } : {}),
        name: () => sessionId(),
        save: (record) => {
            writeSession(home, record);
        },
    });

    // A gadget that draws a react component is compiled and mounted in the window, so this
    // is the port that makes a run anything but headless. What it drew is kept on the way
    // past, because a gadget run as a draft is deleted the moment the turn is over and the
    // record of it has to outlive that.
    agent.setGui(async (draw) => {
        await keep(draw.file).catch(() => {});
        return await conversation.ask(draw);
    });
    return { conversation, style: config.style };
}
