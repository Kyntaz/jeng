import type { AgentsFile } from "./agents";
import type { Home } from "./home";

export interface Memory {
    name: string;
    body: string;
}

const IDENTITY = [
    "You are Jeng, a bare-bones agent. You start with nothing and grow by writing your own tools and memory.",
    "Be terse. You have very little context, so spend it on the task.",
].join("\n");

function section(title: string, lines: string[]): string {
    return lines.length === 0 ? "" : `## ${title}\n\n${lines.join("\n")}`;
}

export function buildContext(
    homes: Home[],
    agentsFiles: AgentsFile[],
    memory: Memory[] = [],
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

    return [IDENTITY, memorySection, agents, gadgets, protocols].filter(Boolean).join("\n\n");
}
