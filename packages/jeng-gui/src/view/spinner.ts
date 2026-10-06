import { useEffect, useState } from "react";

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

/**
 * A frame that moves while Jeng is working. The terminal keeps its own copy of this
 * rather than sharing one, because a spinner belongs to the surface it spins on and
 * neither frontend should be able to move the other's.
 */
export function useSpinner(active: boolean): string {
    const [frame, setFrame] = useState(0);
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => setFrame((index) => (index + 1) % FRAMES.length), 80);
        return () => clearInterval(timer);
    }, [active]);
    return FRAMES[frame];
}
