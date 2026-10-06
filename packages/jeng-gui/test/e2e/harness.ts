import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { type Browser, chromium, type Page } from "playwright-core";
import { PNG } from "pngjs";

/**
 * The window as a picture.
 *
 * A scenario is markup and the real stylesheet, put into a real browser and photographed.
 * Nothing is bundled and no transport is stood up: what is being looked at is theme.css
 * against the components that use it, and going through the rpc would add a moving part
 * that says nothing about how it looks.
 */

const THEME = await Bun.file(join(import.meta.dir, "..", "..", "src", "view", "theme.css")).text();

/** One window's worth of page, so a picture is a window rather than a scroll of one. */
const VIEWPORT = { width: 900, height: 700 };

/** Committed, and the thing this run is compared against. */
const BASELINES = join(import.meta.dir, "__pictures__");

/** This run's photographs and the diffs against them, which is where review happens. */
const ARTIFACTS = join(import.meta.dir, "..", "..", "..", "..", "artifacts", "pictures");

/**
 * The stylesheet inlined rather than linked, so the page cannot be photographed mid-load.
 * Motion is stilled for the same reason: a spinner pulsing makes two runs of the same
 * window differ by pixels that are nobody's fault.
 */
const html = (markup: string) => `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <style>${THEME}</style>
        <style>
            *,
            *::before,
            *::after {
                animation: none !important;
                transition: none !important;
                caret-color: transparent !important;
            }
        </style>
    </head>
    <body>${markup}</body>
</html>`;

/**
 * Photograph one window and hold it against the last one of these that was kept.
 *
 * A name that has never been seen before is simply recorded, since a scenario with nothing
 * to differ from cannot disagree with anything. Everything else is compared and, when it
 * comes to something else, the diff is written next to the picture: the test says what
 * moved, and the picture says where.
 */
export async function picture(name: string, markup: string): Promise<void> {
    const before = Bun.file(join(BASELINES, `${name}.png`));
    if (!(await before.exists())) {
        await Bun.write(join(BASELINES, `${name}.png`), await shoot(markup));
        return;
    }
    await compare(name, await before.arrayBuffer(), await shoot(markup));
}

let browser: Browser | undefined;
let shot: Page | undefined;

async function shoot(markup: string): Promise<Buffer> {
    // One page for every scenario: a browser per picture costs more than the pictures are
    // worth, and a page holds nothing a scenario depends on being clean for.
    if (!browser) browser = await chromium.launch();
    if (!shot) shot = await browser.newPage({ viewport: VIEWPORT });
    await shot.setContent(html(markup));
    return shot.screenshot();
}

/** Put the browser away, or a failing comparison leaves it running for the rest of the suite. */
export async function stop(): Promise<void> {
    await browser?.close();
    browser = undefined;
    shot = undefined;
}

async function compare(name: string, before: ArrayBuffer, after: Buffer): Promise<void> {
    const held = PNG.sync.read(Buffer.from(before));
    const shot = PNG.sync.read(after);

    await mkdir(ARTIFACTS, { recursive: true });
    await Bun.write(join(ARTIFACTS, `${name}.png`), after);

    if (held.width !== shot.width || held.height !== shot.height)
        throw new Error(
            `${name} is ${shot.width}x${shot.height} and was ${held.width}x${held.height}: ` +
                "the window changed shape, so the two cannot be compared pixel for pixel",
        );

    const diff = new PNG({ width: held.width, height: held.height });
    // Nothing is allowed to move: the same window rendered twice on the same machine is
    // the same picture, so anything else is a change somebody made and has not looked at.
    const moved = pixelmatch(held.data, shot.data, diff.data, held.width, held.height, {
        threshold: 0,
        includeAA: true,
    });

    if (moved === 0) return;
    await Bun.write(join(ARTIFACTS, `${name}.diff.png`), PNG.sync.write(diff));
    throw new Error(
        `${name} moved ${moved} of ${held.width * held.height} pixels: ` +
            `artifacts/pictures/${name}.diff.png says where`,
    );
}
