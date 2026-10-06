import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Code } from "../../src/view/code";

const shown = (code: string, language?: string) =>
    renderToStaticMarkup(<Code code={code} language={language} />);

describe("code being reviewed", () => {
    test("marks up the words it recognises rather than leaving a wall of identifiers", () => {
        expect(shown("export default async () => 1", "typescript")).toContain(
            '<span class="hljs-keyword">export</span>',
        );
    });

    test("reads a patch for what changed", () => {
        const markup = shown("+added\n-removed", "diff");

        expect(markup).toContain("hljs-addition");
        expect(markup).toContain("hljs-deletion");
    });

    test("works out the language itself when the caller did not say, since an approval names none", () => {
        expect(shown('{"a": 1}')).toContain("hljs-");
    });

    test("still shows code in a language it was told about but does not carry", () => {
        const markup = shown("fn main() {}", "brainfuck");

        expect(markup).toContain("main");
        expect(markup).toContain("{}");
    });

    test("shows the code as text rather than running it, since this is what a model proposed", () => {
        const markup = shown("<img src=x onerror=alert(1)>", "xml");

        expect(markup).not.toContain("<img");
        expect(markup).toContain("&lt;");
        expect(markup).toContain("onerror");
    });

    test("cannot be talked out of its own closing tag, which is the one tag that matters here", () => {
        const markup = shown("</code></pre><script>alert(1)</script>", "typescript");

        // The one `</code>` left is the one this component drew; an injection that got out
        // would leave a second, and an `<script>` alongside it.
        expect(markup.match(/<\/code>/g)).toHaveLength(1);
        expect(markup).not.toContain("<script");
    });

    test("leaves a line break a line break", () => {
        expect(shown("one\ntwo", "typescript")).toContain("\ntwo");
    });
});
