import type { AgentsFile } from "./agents";
import type { Home } from "./home";
import { DEFAULT_MODE, identity, type Mode } from "./mode";
import { prompt } from "./prompts";

export interface Memory {
    name: string;
    body: string;
}

function section(title: string, lines: string[]): string {
    return lines.length === 0 ? "" : `## ${title}\n\n${lines.join("\n")}`;
}

function usageLine(usage?: { tokens: number; contextWindow: number }): string {
    if (!usage) return "";
    const urgent = usage.tokens >= usage.contextWindow * 0.8 ? " Compact now." : "";
    return prompt("context-usage", {
        tokens: String(usage.tokens),
        contextWindow: String(usage.contextWindow),
        urgent,
    });
}

export function loadedAgents(homes: Home[], agentsFiles: AgentsFile[]): AgentsFile[] {
    return [
        ...homes.flatMap((home) => (home.agents ? [{ dir: home.dir, content: home.agents }] : [])),
        ...agentsFiles,
    ];
}

export function buildContext(
    homes: Home[],
    agentsFiles: AgentsFile[],
    memory: Memory[] = [],
    session?: { tokens: number; contextWindow: number; ui?: boolean; mode?: Mode },
): string {
    const agents = section(
        "Always loaded instructions",
        loadedAgents(homes, agentsFiles).map(
            (file) => `### ${file.dir}/AGENTS.md\n${file.content.trim()}`,
        ),
    );

    const gadgets = section(
        "Gadgets",
        homes.flatMap((home) =>
            home.gadgets
                .filter((gadget) => session?.ui || !gadget.ui)
                .map((gadget) => `- \`${gadget.name}\`: ${gadget.description}`),
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

    return [
        usageLine(session),
        identity(session?.mode ?? DEFAULT_MODE),
        memorySection,
        agents,
        gadgets,
        protocols,
    ]
        .filter(Boolean)
        .join("\n\n");
}
