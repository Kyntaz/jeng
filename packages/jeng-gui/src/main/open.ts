import { type Approve, createAgent, loadConfig, type Mode } from "@jeng/core";
import { type Conversation, createConversation } from "@jeng/view";
import { keep } from "./server";
import type { Settings } from "./settings";

// Nothing is approved before the window exists to ask, which is the same reason a piped
// terminal run will not write to a home without being told to.
const noone: Approve = async () => ({
    approved: false,
    reason: "there is no window to approve on",
});

/**
 * Homes, model and the AGENTS.md chain are all settled when an agent is built, so applying
 * a config or a directory means building another one rather than editing the one in hand.
 * The mode carries over, because dropping from work to learn would hand back the ability
 * to write to a home.
 */
export async function open(from: Settings, mode?: Mode): Promise<Conversation> {
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
    // is the port that makes a run anything but headless. What it drew is kept on the way
    // past, because a gadget run as a draft is deleted the moment the turn is over and the
    // record of it has to outlive that.
    agent.setGui(async (draw) => {
        await keep(draw.file).catch(() => {});
        return await conversation.ask(draw);
    });
    return conversation;
}
