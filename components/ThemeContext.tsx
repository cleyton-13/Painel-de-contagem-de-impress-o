'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';

export type Palette = 'atual' | 'petrol' | 'champagne';

export const PALETTES: Array<{ id: Palette; label: string }> = [
  { id: 'atual', label: 'Atual' },
  { id: 'petrol', label: 'Petrol clean' },
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

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('dark');
  const [palette, setPalette] = useState<Palette>('atual');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved) setTheme(saved);
    const savedPalette = localStorage.getItem('palette') as Palette | null;
    if (savedPalette) setPalette(savedPalette);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('palette', palette);
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, palette, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
};
