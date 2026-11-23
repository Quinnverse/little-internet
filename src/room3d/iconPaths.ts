/** The few icons the visitor runtime needs (the editor has its own, larger set). */
export const ICON_PATHS = {
  pen: 'M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19zM14.5 6.5l3 3',
  computer: 'M4 4.5h16v11H4zM9 20h6M12 15.5V20M7 8h6',
  phone: 'M5 9.5c2.5-3 11.5-3 14 0l-1.5 2.5-3-1V9h-5v2l-3 1zM6 13h12l1 7H5zM12 15.5v.01M9.5 17.5v.01M14.5 17.5v.01',
  ghost: 'M6 20V11a6 6 0 0 1 12 0v9l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM10 11v.01M14 11v.01',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  door: 'M6 21V4h10v17M4 21h16M13 12.5v.01M16 4l3 1.5V21',
  book: 'M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5zM5 17.5A2.5 2.5 0 0 1 7.5 15H18M9 8.5h5',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  close: 'M6 6l12 12M18 6 6 18',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  play: 'M8 5l11 7-11 7z',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
} as const

export type IconKey = keyof typeof ICON_PATHS

export function svgIcon(name: IconKey, size = 18): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`
}
