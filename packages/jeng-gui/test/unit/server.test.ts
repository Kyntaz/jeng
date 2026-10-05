import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { serve } from "../../src/main/server";

const GADGET = `/**
 * name: pick
 * gui: true
 * description: asks which branch
 */

import { useState } from "react";

export function View(props: { options: string[] }) {
    const [picked] = useState<string>();
    return (
        <div>
            <h3>{picked ?? "pick one"}</h3>
            {props.options.map((option) => (
                <button key={option}>{option}</button>
            ))}
        </div>
    );
}

export default async (input: { options: string[] }, ui) => JSON.stringify(await ui(input));
`;

/** A gadget that imports something only bun has, which the browser half cannot use. */
const BUNNY = `/**
 * name: bunny
 * gui: true
 * description: shells out
 */

import { join } from "node:path";
import { useState } from "react";

export function View() {
    const [n] = useState(0);
    return <p>{join("a", "b")}{n}</p>;
}

export default async () => "shelled";
`;

async function withGadget(source: string, run: (url: string, file: string) => Promise<void>) {
    const dir = await mkdtemp(join(tmpdir(), "jeng-gui-"));
    const file = join(dir, "gadget.tsx");
    await writeFile(file, source);
    const site = serve();
    try {
        await run(site.url, file);
    } finally {
        site.stop();
        await rm(dir, { recursive: true, force: true });
    }
}

const chunk = (url: string, file: string) =>
    fetch(`${url}gadget/${encodeURIComponent(file)}`).then((reply) => reply.text());

describe("the window's own files", () => {
    test("serves a shell that loads the view and the stylesheet", async () => {
        const site = serve();
        try {
            const page = await fetch(site.url).then((reply) => reply.text());

            expect(page).toContain("/view.js");
            expect(page).toContain("/theme.css");
        } finally {
            site.stop();
        }
    });

    test("serves the view as a module rather than as a file to read", async () => {
        const site = serve();
        try {
            const reply = await fetch(`${site.url}view.js`);

            expect(reply.headers.get("content-type")).toContain("javascript");
            expect(await reply.text()).toContain("createRoot");
        } finally {
            site.stop();
        }
    });

    test("gives a gadget the same stylesheet the window uses", async () => {
        const site = serve();
        try {
            const [app, gadget] = await Promise.all([
                fetch(`${site.url}theme.css`).then((reply) => reply.text()),
                fetch(`${site.url}gadget.css`).then((reply) => reply.text()),
            ]);

            expect(gadget).toBe(app);
        } finally {
            site.stop();
        }
    });

    test("says so rather than serving nothing for a path it does not have", async () => {
        const site = serve();
        try {
            expect((await fetch(`${site.url}nope`)).status).toBe(404);
        } finally {
            site.stop();
        }
    });
});

describe("a gadget's component", () => {
    test("is served as a module that mounts rather than as a component", async () => {
        await withGadget(GADGET, async (url, file) => {
            const code = await chunk(url, file);

            expect(code).toContain("export");
            expect(code).toMatch(/mount/);
        });
    });

    test("brings its own react rather than sharing the window's", async () => {
        await withGadget(GADGET, async (url, file) => {
            // The window's react is a separate bundle in the page, so a component that
            // shared it would be a second react inside one tree.
            expect(await chunk(url, file)).toContain("createRoot");
        });
    });

    test("still builds when the gadget's bun half imports something the browser has not got", async () => {
        await withGadget(BUNNY, async (url, file) => {
            const reply = await fetch(`${url}gadget/${encodeURIComponent(file)}`);

            expect(reply.status).toBe(200);
        });
    });

    test("is rebuilt when the file behind it changes", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jeng-gui-"));
        const file = join(dir, "gadget.tsx");
        await writeFile(file, GADGET);
        const site = serve();
        try {
            const before = await chunk(site.url, file);
            await writeFile(file, GADGET.replace("pick one", "choose one"));
            const after = await chunk(site.url, file);

            expect(before).not.toBe(after);
        } finally {
            site.stop();
            await rm(dir, { recursive: true, force: true });
        }
    });

    test("says why it could not be built rather than serving a broken module", async () => {
        await withGadget(
            "/**\n * name: broken\n * gui: true\n * description: x\n */\n\nexport function View( {\n",
            async (url, file) => {
                const reply = await fetch(`${url}gadget/${encodeURIComponent(file)}`);

                expect(reply.status).toBe(500);
                expect(await reply.text()).not.toBe("");
            },
        );
    });

    test("is not found at all when there is no such file", async () => {
        const site = serve();
        try {
            const reply = await fetch(`${site.url}gadget/${encodeURIComponent("/nope/gone.tsx")}`);

            expect(reply.status).toBe(500);
        } finally {
            site.stop();
        }
    });
});
