import type { Style } from "../tokens";
import { COLORFUL_DARK, COLORFUL_LIGHT } from "./colorful";
import { MODERN_DARK, MODERN_LIGHT } from "./modern";
import { SIMPLE_DARK, SIMPLE_LIGHT } from "./simple";

/** The six, in the order they are listed to anyone who asks what there is. `simple-dark`
 *  is the default and is what a style that leaves a token out falls back to. */
export const STYLES = {
    "simple-dark": SIMPLE_DARK,
    "simple-light": SIMPLE_LIGHT,
    "modern-dark": MODERN_DARK,
    "modern-light": MODERN_LIGHT,
    "colorful-dark": COLORFUL_DARK,
    "colorful-light": COLORFUL_LIGHT,
} satisfies Record<string, Style>;

export type StyleName = keyof typeof STYLES;

export const DEFAULT_STYLE: StyleName = "simple-dark";
