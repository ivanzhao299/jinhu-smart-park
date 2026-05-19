"use client";

import React from 'react';
import { useTheme } from './ThemeProvider';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@jinhu/ui';

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <Button 
      variant="secondary" 
      onClick={toggleTheme} 
      title={`当前主题: ${theme}`}
      className="theme-toggle-button"
    >
      {theme === 'system' ? <Monitor size={16} /> : 
       resolvedTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
    </Button>
  );
}
