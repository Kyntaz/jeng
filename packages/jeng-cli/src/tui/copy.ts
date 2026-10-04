import { useRenderer, useSelectionHandler } from "@opentui/react";

// The alternate screen is the one a terminal cannot select out of, so what the user
// drags has to be handed to the clipboard itself rather than left for the terminal
// to copy, which it will not.
export function useCopySelection(): void {
    const renderer = useRenderer();
    useSelectionHandler((selection) => {
        const text = selection.getSelectedText();
        if (text.trim()) renderer.copyToClipboardOSC52(text);
    });
}
