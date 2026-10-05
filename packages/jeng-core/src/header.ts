export interface Header {
    name: string;
    description: string;
    when: string;
    /** Whether a gadget draws a widget tree, which a run with no terminal cannot do. */
    ui: string;
    /** Whether a gadget draws a react component, which a run with no window cannot do. */
    gui: string;
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
        gui: values.gui ?? "",
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

export function writeProtocol(header: Omit<Header, "ui" | "gui">, body: string): string {
    const lines = Object.entries(header)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}: ${value}`);
    return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

// A gadget that draws a react component is jsx, which bun will not parse in a `.ts`
// file, so the header decides the extension rather than the other way round.
export const extension = (header: Header): "ts" | "tsx" => (header.gui === "true" ? "tsx" : "ts");
