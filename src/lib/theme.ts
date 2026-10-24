/** The colour theme stored in the `theme` cookie; `system` follows the OS preference. */
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: 'Segui il sistema',
  light: 'Chiaro',
  dark: 'Scuro',
};

/** Anything that is not a known theme (a missing or tampered cookie) means `system`. */
export function parseTheme(raw: string | undefined): Theme {
  return THEMES.find((theme) => theme === raw) ?? 'system';
}
