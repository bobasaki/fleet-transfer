// formStyles.ts — shared style tokens and CSS-module surface for the transfer form.
// CSSProperties objects have been replaced by CSS classes in formStyles.module.css.
// Call-sites: import { s, cx } for classNames, import token constants as needed.

import styles from "./formStyles.module.css";
export const s = styles;

/** Minimal classname joiner — filters falsy values. */
export function cx(...args: Array<string | false | null | undefined>): string {
  return args.filter((a): a is string => Boolean(a)).join(" ");
}

// ---- Design tokens (JS constants for inline use) ----

export const RED       = "var(--red)";
export const RED_MID   = "var(--red-mid)";
export const RED_DARK  = "var(--red-mid)";
export const RED_PALE  = "var(--red-dim)";
export const INK       = "var(--text)";
export const INK_SOFT  = "var(--text-sec)";
export const MUTED     = "var(--text-muted)";
export const BORDER    = "var(--border)";
export const WHITE     = "#FFFFFF";
export const SURFACE   = "var(--bg)";
export const CARD_BG   = "var(--card-bg)";

export const FONT_DISPLAY = "var(--font-sans, 'Instrument Sans', system-ui, sans-serif)";
export const FONT_MONO    = "var(--font-mono, 'JetBrains Mono', monospace)";
