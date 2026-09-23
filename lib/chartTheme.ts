'use client';

// Lê as variáveis de paleta definidas em app/globals.css
// (html[data-palette="..."] + html.dark / html.light).
// Os componentes chamam isso no render, então trocar a paleta
// no ThemeContext re-renderiza e os gráficos atualizam sozinhos.

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export const chartTheme = {
  pb: () => cssVar('--chart-pb', '#3b82f6'),
  color: () => cssVar('--chart-color', '#ec4899'),
  total: () => cssVar('--chart-total', '#22d3ee'),
  pbAlt: () => cssVar('--chart-pb-alt', '#06b6d4'),
  colorAlt: () => cssVar('--chart-color-alt', '#8b5cf6'),
  grid: () => cssVar('--chart-grid', '#1e293b'),
  axis: () => cssVar('--chart-axis', '#94a3b8'),
  tooltipBg: () => cssVar('--chart-tooltip-bg', '#0f172a'),
  tooltipBorder: () => cssVar('--chart-tooltip-border', '#334155'),
  tooltipColor: () => cssVar('--chart-tooltip-color', '#ffffff'),
};
