export interface Header {
    name: string;
    description: string;
    when: string;
    /** Whether a gadget draws and asks, which a run with no UI to draw on cannot do. */
    ui: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;
const COMMENT = /^\s*\/\*\*([\s\S]*?)\*\//;

function fields(block: string): Header {
    const values: Record<string, string> = {};
    for (const line of block.split("\n")) {
        const match = /^\s*\*?\s*([a-z]+)\s*:\s*(.+?)\s*$/.exec(line);
        if (match) values[match[1]] = match[2];
    }
    return {
        name: values.name ?? "",
        description: values.description ?? "",
        when: values.when ?? "",
        ui: values.ui ?? "",
    };
}

export function parseProtocol(source: string): { header: Header; body: string } | null {
    const match = FENCE.exec(source);
    return match ? { header: fields(match[1]), body: source.slice(match[0].length) } : null;
}

export function parseGadget(source: string): Header | null {
    const match = COMMENT.exec(source);
    return match ? fields(match[1]) : null;
}

export function writeProtocol(header: Omit<Header, "ui">, body: string): string {
    const lines = Object.entries(header)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}: ${value}`);
    return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}
