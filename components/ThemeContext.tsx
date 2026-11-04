'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';
export type Palette = 'atual' | 'petrol' | 'champagne';

export const PALETTES: Array<{ id: Palette; label: string }> = [
  { id: 'atual', label: 'Atual' },
  { id: 'petrol', label: 'Petrol Clean' },
  { id: 'champagne', label: 'Champagne' },
];

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  palette: 'atual',
  setPalette: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    try {
      const savedTheme = localStorage.getItem('theme') as Theme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    } catch { }
  }
  return 'dark';
}

function getInitialPalette(): Palette {
  if (typeof window !== 'undefined') {
    try {
      const savedPalette = localStorage.getItem('palette') as Palette | null;
      if (savedPalette && (savedPalette === 'atual' || savedPalette === 'petrol' || savedPalette === 'champagne')) {
        return savedPalette;
      }
    } catch { }
  }
  return 'atual';
}

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [palette, setPaletteState] = useState<Palette>(getInitialPalette);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.dataset.palette = palette;
  }, [theme, palette]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch { }
      return next;
    });
  };

  const setPalette = (nextPalette: Palette) => {
    setPaletteState(nextPalette);
    try {
      localStorage.setItem('palette', nextPalette);
    } catch { }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
};
