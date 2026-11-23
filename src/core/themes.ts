import type { Theme } from './schema.ts'

type ThemeVars = {
  bg: string
  fg: string
  muted: string
  card: string
  border: string
  accent: string
  font: string
}

export const THEME_VARS: Record<Theme, ThemeVars> = {
  paper: {
    bg: '#f6f0e4',
    fg: '#2b2620',
    muted: '#7a6f60',
    card: '#fffaf0',
    border: '#d9cdb8',
    accent: '#c2562c',
    font: 'Georgia, "Times New Roman", serif',
  },
  midnight: {
    bg: '#14111f',
    fg: '#ece8f6',
    muted: '#9a90b5',
    card: '#1f1a30',
    border: '#3a3157',
    accent: '#f28c38',
    font: '"Trebuchet MS", system-ui, sans-serif',
  },
  meadow: {
    bg: '#eaf3e2',
    fg: '#1f3020',
    muted: '#5c7458',
    card: '#f7fbf2',
    border: '#bcd3ae',
    accent: '#3f8a4a',
    font: 'Verdana, system-ui, sans-serif',
  },
}

export function themeCss(theme: Theme): string {
  const v = THEME_VARS[theme]
  return `:root{--bg:${v.bg};--fg:${v.fg};--muted:${v.muted};--card:${v.card};--border:${v.border};--accent:${v.accent};--font:${v.font}}`
}
