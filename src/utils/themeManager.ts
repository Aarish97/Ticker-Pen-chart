/**
 * Chrome Theme Manager (Top Panel & Side Tool Panel Only)
 * Allows user to toggle between Light, Dark, and System Default themes
 * strictly for UI toolbars without altering chart colors, candles, or canvas.
 */

export type ChromeThemeMode = 'light' | 'dark' | 'system';

export const STORAGE_KEY_CHROME_THEME = '__chrome_theme_mode__';

export function getSavedChromeThemeMode(): ChromeThemeMode {
  try {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_CHROME_THEME) as ChromeThemeMode;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
  } catch (e) {
    console.warn('Failed to read chrome theme mode:', e);
  }
  return 'dark'; // default to Dark mode
}

export function getEffectiveChromeTheme(mode: ChromeThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return mode;
}

export function applyChromeTheme(mode: ChromeThemeMode): void {
  if (typeof document === 'undefined') return;
  const effective = getEffectiveChromeTheme(mode);
  
  document.documentElement.setAttribute('data-chrome-theme', effective);
  document.body.setAttribute('data-chrome-theme', effective);
  
  if (effective === 'light') {
    document.documentElement.classList.add('chrome-theme-light');
    document.documentElement.classList.remove('chrome-theme-dark');
    document.body.classList.add('chrome-theme-light');
    document.body.classList.remove('chrome-theme-dark');
  } else {
    document.documentElement.classList.add('chrome-theme-dark');
    document.documentElement.classList.remove('chrome-theme-light');
    document.body.classList.add('chrome-theme-dark');
    document.body.classList.remove('chrome-theme-light');
  }

  // Dispatch event for UI reactivity
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('chrome-theme-changed', {
      detail: { mode, effective }
    }));
  }
}

export function setChromeThemeMode(mode: ChromeThemeMode): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CHROME_THEME, mode);
    }
  } catch (e) {
    console.warn('Failed to save chrome theme mode:', e);
  }
  applyChromeTheme(mode);
}

// Global system preference change listener
if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    const currentMode = getSavedChromeThemeMode();
    if (currentMode === 'system') {
      applyChromeTheme('system');
    }
  });
}
