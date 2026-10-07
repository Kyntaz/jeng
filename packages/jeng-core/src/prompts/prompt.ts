import COMPACT_NO_SUMMARY from "./compact-no-summary.txt" with { type: "text" };
import CONTEXT_USAGE from "./context-usage.txt" with { type: "text" };
import DRAWS_UNDECLARED from "./draws-undeclared.txt" with { type: "text" };
import GADGET_DRAWS from "./gadget-draws.txt" with { type: "text" };
import GUI_LANGUAGE from "./gui-language.txt" with { type: "text" };
import IDENTITY_LEARN from "./identity-learn.txt" with { type: "text" };
import IDENTITY_WORK from "./identity-work.txt" with { type: "text" };
import LEARN_ONLY_ACTION from "./learn-only-action.txt" with { type: "text" };
import NO_INTERFACE from "./no-interface.txt" with { type: "text" };
import NO_WINDOW from "./no-window.txt" with { type: "text" };
import NUDGE from "./nudge.txt" with { type: "text" };
import REJECTED_CHANGE from "./rejected-change.txt" with { type: "text" };
import REJECTED_DELETE from "./rejected-delete.txt" with { type: "text" };
import REPEAT_CALL from "./repeat-call.txt" with { type: "text" };
import RULES from "./rules.txt" with { type: "text" };
import TOOL_CLOSE from "./tool-close.txt" with { type: "text" };
import TOOL_LEARN from "./tool-learn.txt" with { type: "text" };
import TOOL_OPEN from "./tool-open.txt" with { type: "text" };
import TOOL_USES from "./tool-uses.txt" with { type: "text" };
import TOOL_WORK from "./tool-work.txt" with { type: "text" };
import UI_LANGUAGE from "./ui-language.txt" with { type: "text" };
import UNTESTED_GADGET from "./untested-gadget.txt" with { type: "text" };

const ALL = {
    "compact-no-summary": COMPACT_NO_SUMMARY,
    "context-usage": CONTEXT_USAGE,
    "draws-undeclared": DRAWS_UNDECLARED,
    "gadget-draws": GADGET_DRAWS,
    "gui-language": GUI_LANGUAGE,
    "identity-learn": IDENTITY_LEARN,
    "identity-work": IDENTITY_WORK,
    "learn-only-action": LEARN_ONLY_ACTION,
    "no-interface": NO_INTERFACE,
    "no-window": NO_WINDOW,
    nudge: NUDGE,
    "rejected-change": REJECTED_CHANGE,
    "rejected-delete": REJECTED_DELETE,
    "repeat-call": REPEAT_CALL,
    rules: RULES,
    "tool-close": TOOL_CLOSE,
    "tool-learn": TOOL_LEARN,
    "tool-open": TOOL_OPEN,
    "tool-uses": TOOL_USES,
    "tool-work": TOOL_WORK,
    "ui-language": UI_LANGUAGE,
    "untested-gadget": UNTESTED_GADGET,
} as const;

export function prompt(name: keyof typeof ALL, data: Record<string, string> = {}): string {
    return ALL[name].trim().replace(/\$\{(\w+)\}/g, (_, slot: string) => {
        if (!(slot in data)) throw new Error(`${name} has no slot ${slot}`);
        return data[slot];
    });
}
