import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

/**
 * Code coloured the way it will be read, which is the whole point of putting it on screen:
 * a wall of identifiers asks to be skimmed past, and a diff asks to be read closely. The
 * languages are named rather than all of them carried, since what Jeng proposes is mostly
 * typescript, a shell line and a patch, and the window's bundle is loaded every launch.
 */
const colored = (code: string, language?: string): string => {
    try {
        // A language the caller named that is not registered, or a snippet none of the
        // registered ones recognise, is still worth reading: it comes back as plain text
        // rather than as an error.
        const known = language && hljs.getLanguage(language);
        return known ? hljs.highlight(code, { language }).value : hljs.highlightAuto(code).value;
    } catch {
        const escaped = code.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
        return escaped.replaceAll(">", "&gt;");
    }
};

/**
 * What is being reviewed, in the markup highlight.js emits. Its output is escaped on the way
 * in and carries nothing but spans, which is what makes handing it to the dom outright the
 * documented way to use it.
 */
export function Code({ code, language }: { code: string; language?: string }) {
    return (
        <pre className="card">
            <code dangerouslySetInnerHTML={{ __html: colored(code, language) }} />
        </pre>
    );
}
