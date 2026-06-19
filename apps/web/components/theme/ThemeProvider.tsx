"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Theme =
  | 'dark'
  | 'light'
  | 'system'
  | 'enterprise-light'
  | 'harbor-blue'
  | 'forest-green'
  | 'graphite-gold'
  | 'violet-dusk'
  | 'terra-cotta'
  | 'command-dark';

export const THEME_OPTIONS: Array<{ value: Theme; label: string; mode: 'light' | 'dark' }> = [
  { value: 'enterprise-light', label: '企业浅色', mode: 'light' },
  { value: 'harbor-blue', label: '深海蓝', mode: 'light' },
  { value: 'forest-green', label: '森绿', mode: 'light' },
  { value: 'graphite-gold', label: '石墨金', mode: 'light' },
  { value: 'violet-dusk', label: '暮紫', mode: 'light' },
  { value: 'terra-cotta', label: '暖岩', mode: 'light' },
  { value: 'command-dark', label: '指挥深色', mode: 'dark' },
  { value: 'system', label: '跟随系统', mode: 'light' }
];

const THEME_VALUES = new Set<Theme>([
  'dark',
  'light',
  'system',
  'enterprise-light',
  'harbor-blue',
  'forest-green',
  'graphite-gold',
  'violet-dusk',
  'terra-cotta',
  'command-dark'
]);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'dark' | 'light';
  themeLabel: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children, defaultTheme = 'light' }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('jinhu_theme') as Theme | null;
    if (savedTheme && THEME_VALUES.has(savedTheme)) {
      setThemeState(savedTheme);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = (currentTheme: Theme) => {
      let isDark = false;
      if (currentTheme === 'system') {
        isDark = mediaQuery.matches;
      } else {
        isDark = currentTheme === 'dark' || currentTheme === 'command-dark';
      }

      setResolvedTheme(isDark ? 'dark' : 'light');

      if (currentTheme === 'system') {
        document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
      } else if (THEME_VALUES.has(currentTheme)) {
        document.documentElement.dataset.theme = currentTheme;
      } else {
        document.documentElement.dataset.theme = 'light';
      }
    };

    applyTheme(theme);

    const listener = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('jinhu_theme', newTheme);
  };

  const themeLabel = useMemo(() => {
    return THEME_OPTIONS.find((option) => option.value === theme)?.label ?? (theme === 'dark' ? '深色' : '浅色');
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, themeLabel }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
