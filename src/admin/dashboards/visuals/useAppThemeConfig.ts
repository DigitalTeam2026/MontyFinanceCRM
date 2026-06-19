import { useState, useEffect } from 'react';
import type { ThemeConfig } from '../types/dashboard';

/**
 * Bridge the app's CSS-variable theme system (the `[data-theme="…"]` token blocks
 * in index.css, swapped by themeService.applyTheme) into the dashboard's
 * prop-driven `ThemeConfig`. Forms and list views recolour for free because they
 * use `var(--…)` directly; dashboard visuals receive concrete colours as props,
 * so we resolve the live tokens here and hand them down. Reading via
 * getComputedStyle returns the already-resolved concrete colour for the active
 * theme — safe to feed to canvas-based charts (ECharts) which can't parse var().
 *
 * Only base tokens (concrete hex/rgb) are read — never derived `color-mix(...)`
 * aliases, which getComputedStyle leaves unresolved.
 */

function readVar(cs: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = cs.getPropertyValue(name).trim();
  return v || fallback;
}

/** Snapshot the active app theme's tokens into a dashboard ThemeConfig. */
export function buildThemeFromCss(): ThemeConfig {
  const cs = getComputedStyle(document.documentElement);
  const surface = readVar(cs, '--surface', '#ffffff');
  const surface2 = readVar(cs, '--surface-2', surface);
  const appBg = readVar(cs, '--app-bg', '#f7f6f3');
  const text = readVar(cs, '--text', '#16213b');
  const muted = readVar(cs, '--muted', '#6b7280');
  const border = readVar(cs, '--border', '#e7e4dc');
  const primary = readVar(cs, '--primary', '#16213b');
  const accent = readVar(cs, '--link', primary);
  const success = readVar(cs, '--success', '#1fa45c');
  const warning = readVar(cs, '--warn-text', '#a07b2d');
  const error = readVar(cs, '--danger', '#c2410c');
  const shadow = readVar(cs, '--shadow', '0 6px 20px -12px rgba(0,0,0,.18)');

  return {
    pageBackground: appBg,
    surfaceBackground: surface2,
    cardBackground: surface,
    primaryText: text,
    secondaryText: muted,
    borderColor: border,
    gridLineColor: border,
    primaryAccent: primary,
    secondaryAccent: accent,
    success,
    warning,
    error,
    // Series 1–5 are theme-driven; 6–8 are fixed distinct hues that read well on
    // both light and dark surfaces, so charts with many series stay legible.
    chartPalette: [primary, accent, success, warning, error, '#14b8a6', '#ec4899', '#a855f7'],
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: 12,
    shadow,
  };
}

/**
 * Live dashboard ThemeConfig derived from the active app theme. Recomputes
 * whenever themeService swaps `data-theme` (or toggles the `dark` class) on
 * <html>, so dashboards recolour in lockstep with forms and list views.
 */
export function useAppThemeConfig(): ThemeConfig {
  const [theme, setTheme] = useState<ThemeConfig>(() => buildThemeFromCss());

  useEffect(() => {
    const update = () => setTheme(buildThemeFromCss());
    const obs = new MutationObserver((muts) => {
      if (muts.some((m) => m.attributeName === 'data-theme' || m.attributeName === 'class')) update();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    // Re-sync once after mount in case the theme was applied between the initial
    // useState snapshot and the observer attaching.
    update();
    return () => obs.disconnect();
  }, []);

  return theme;
}
