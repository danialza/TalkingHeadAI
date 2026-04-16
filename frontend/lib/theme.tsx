'use client';
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeName = 'classic' | 'aurora';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'th-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('classic');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'classic' || saved === 'aurora') {
        setThemeState(saved);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeName = prev === 'classic' ? 'aurora' : 'classic';
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {/* suppress hydration mismatch — server renders default 'classic', client may swap */}
      <div data-theme-root={hydrated ? theme : 'classic'} suppressHydrationWarning>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback for components rendered outside provider (e.g. mentor dashboard).
    return {
      theme: 'classic',
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
