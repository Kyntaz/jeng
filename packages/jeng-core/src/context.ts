import type { AgentsFile } from "./agents";
import type { Home } from "./home";

export interface Memory {
    name: string;
    body: string;
}

const IDENTITY = [
    "You are Jeng, a bare-bones agent. You start with nothing and grow by writing your own tools and memory.",
    "Be terse. You have very little context, so spend it on the task.",
    "",
    "How you work:",
    "- Every message you send is exactly one call to your tool.",
    "- Use a gadget or protocol only if it is listed in your context. Otherwise create it first, then use it.",
    "- A gadget is a bun script: it can read files, run processes and reach the network. Writing one is how you",
    "  gain an ability you do not have. Never say you cannot do something before trying that.",
    "- Read each result before acting again. If something failed, fix the cause or answer without it.",
    "- Never make the same call twice. If you are stuck, end with what you know in one line.",
    "- Nothing stops you but your own judgement, so keep going until you have an answer worth giving.",
    "- The user can write to you between your calls. If you see a new message, read it and change course.",
    "",
    "How you finish:",
    '- You finish with action="end", never with plain text. Plain text does not reach the user.',
    '- So every turn ends: {"action": "end", "content": "the answer"}. Do not describe what you',
    "  would say, say it. Do not ask whether you may answer, just answer.",
    "- A turn ends with a result, never with a plan. If you made a gadget to do something, run it and",
    "  report what came back. Never hand back an intention to act.",
].join("\n");

function section(title: string, lines: string[]): string {
    return lines.length === 0 ? "" : `## ${title}\n\n${lines.join("\n")}`;
}

// The model cannot see its own context, so it is told. Past four fifths of the
// window the line tells it to compact rather than leaving the choice to luck.
function usageLine(usage?: { tokens: number; contextWindow: number }): string {
    if (!usage) return "";
    const near = usage.tokens >= usage.contextWindow * 0.8;
    return `Context: ${usage.tokens}/${usage.contextWindow} tokens.${near ? " Compact now." : ""}`;
}

export function buildContext(
    homes: Home[],
    agentsFiles: AgentsFile[],
    memory: Memory[] = [],
    usage?: { tokens: number; contextWindow: number },
): string {
    const agents = section(
        "Always loaded instructions",
        homes
            .flatMap((home) =>
                home.agents ? [`### ${home.dir}/AGENTS.md\n${home.agents.trim()}`] : [],
            )
            .concat(agentsFiles.map((file) => `### ${file.dir}/AGENTS.md\n${file.content.trim()}`)),
    );

    const gadgets = section(
        "Gadgets",
        homes.flatMap((home) =>
            home.gadgets.map((gadget) => `- \`${gadget.name}\`: ${gadget.description}`),
        ),
    );

    const protocols = section(
        "Protocols",
        homes.flatMap((home) =>
            home.protocols.map(
                (protocol) =>
                    `- \`${protocol.name}\` (load when: ${protocol.when}): ${protocol.description}`,
            ),
        ),
    );

    const memorySection = section(
        "Memory",
        memory.map((item) => `### ${item.name}\n\n${item.body.trim()}`),
    );

    return [usageLine(usage), IDENTITY, memorySection, agents, gadgets, protocols]
        .filter(Boolean)
        .join("\n\n");
}
