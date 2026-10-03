import { useEffect, useState } from "react";

export const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

export function useSpinner(active: boolean): string {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => setFrame((index) => (index + 1) % FRAMES.length), 80);
        return () => clearInterval(timer);
    }, [active]);
    return FRAMES[frame];
}
