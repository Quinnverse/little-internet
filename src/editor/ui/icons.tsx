// Inline SVG icons (Requirement 9.4): identical on every OS, no emoji font needed.
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5',
  book: 'M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5zM5 17.5A2.5 2.5 0 0 1 7.5 15H18M9 8.5h5',
  door: 'M6 21V4h10v17M4 21h16M13 12.5v.01M16 4l3 1.5V21',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-1.8 1l-.3 2H10.8l-.3-2a7 7 0 0 1-1.8-1l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-2.1L5 10.2l1.8-3.1 1.9.7a7 7 0 0 1 1.8-1l.3-2h3.4l.3 2a7 7 0 0 1 1.8 1l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 0 1 0 2.1z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  resize: 'M4 9V4h5M20 15v5h-5M4 4l6.5 6.5M20 20l-6.5-6.5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  close: 'M6 6l12 12M18 6 6 18',
  lock: 'M6.5 10.5h11V20h-11zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5',
  open: 'M6 21V4h10v17M4 21h16M13 12.5v.01M16 8h4M18 6l2 2-2 2',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  photo: 'M4 5.5h16v13H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5v.01',
  note: 'M5 4h14v12l-4 4H5zM15 20v-4h4M8.5 9h7M8.5 12.5h5',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6v.01M4.5 12v.01M4.5 18v.01',
  shelf: 'M4 20h16M5 20V5h3v15M10 20V7h3v13M15.2 7.6l2.9-.8 3.4 12.6-2.9.8z',
  ghost: 'M6 20V11a6 6 0 0 1 12 0v9l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM10 11v.01M14 11v.01',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 13.5l5-5 5 5M5 4h14',
  mic: 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6',
  phone: 'M5 9.5c2.5-3 11.5-3 14 0l-1.5 2.5-3-1V9h-5v2l-3 1zM6 13h12l1 7H5zM12 15.5v.01M9.5 17.5v.01M14.5 17.5v.01',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  pen: 'M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19zM14.5 6.5l3 3',
  sofa: 'M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 18v2M18 18v2',
  rotl: 'M4 12a8 8 0 1 0 3-6.2M4 4v4h4',
  rotr: 'M20 12a8 8 0 1 1-3-6.2M20 4v4h-4',
  reset: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M12 18v3M3 12h3M18 12h3',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  undo: 'M8 6l-4.5 4.5L8 15M4 10.5h9a5.5 5.5 0 0 1 0 11h-3',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  cloud: 'M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4.5 4.5 0 0 1 17.5 18zM12 17v-6M9.5 13.5l2.5-2.5 2.5 2.5',
  computer: 'M4 4.5h16v11H4zM9 20h6M12 15.5V20M7 8h6',
  play: 'M8 5l11 7-11 7z',
  stop: 'M7 7h10v10H7z',
  rotate: 'M20 12a8 8 0 1 1-3-6.2M20 4v4h-4',
  // keepsakes
  shell: 'M12 19c-5 0-8-3-8-7 0-2 3-6 8-6s8 4 8 6c0 4-3 7-8 7zM12 19V6M8 18.5 7 8M16 18.5 17 8',
  candle: 'M10 20V10h4v10zM12 7c-1.5-1.5-1.5-3 0-4.5 1.5 1.5 1.5 3 0 4.5zM8 20h8',
  flower: 'M12 20v-8M12 12a3 3 0 1 0-3-3M12 12a3 3 0 1 1 3-3M8 20h8',
  cassette: 'M4 6h16v12H4zM8 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM16 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM7 17h10l-1-3H8z',
  postcard: 'M3.5 6h17v12h-17zM6.5 10h6M6.5 13h4M16 9h2.5v3H16z',
  ticket: 'M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 8v10',
  plant: 'M12 21v-9M12 12c-4 0-6-3-6-6 4 0 6 2 6 6zM12 14c3 0 5-2 5-5-3 0-5 2-5 5zM8 21h8',
  lamp: 'M12 3l-5 8h10zM12 11v8M8.5 21h7',
  cactus: 'M12 21V6a2 2 0 0 1 4 0v6M12 15H8a2 2 0 0 1-2-2V9M8 21h8',
  stool: 'M5 8h14M7 8l-1 12M17 8l1 12M12 8v12',
  basket: 'M4 10h16l-2 10H6zM8 10a4 4 0 0 1 8 0',
  none: 'M5 5l14 14M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  star: 'M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6 6.9 19.3l1-5.7-4.1-4 5.7-.8z',
  redo: 'M16 6l4.5 4.5L16 15M20 10.5h-9a5.5 5.5 0 0 0 0 11h3',
  grip: 'M9 6v.01M15 6v.01M9 12v.01M15 12v.01M9 18v.01M15 18v.01',
  mobile: 'M8 3h8v18H8zM11 18h2',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 21zM7.5 11v.01M10 7.5v.01M14.5 7.5v.01',
  suitcase: 'M4 8h16v12H4zM9 8V5h6v3M4 13h16',
  badge: 'M3 8h18v8H3zM6 12h5M14 11h4v2h-4z',
  pages: 'M7 3h9l4 4v14H7zM16 3v4h4M4 7v14h3',
} as const

export type IconName = keyof typeof PATHS

export function Icon(props: { name: IconName; size?: number; label?: string }) {
  const s = props.size ?? 20
  return (
    <svg
      class="icon"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={props.label ? undefined : 'true'}
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
    >
      <path d={PATHS[props.name]} />
    </svg>
  )
}

/** The same icon as an SVG string, for DOM built outside Preact (3D hotspots). */
export function iconSvg(name: IconName, size = 18): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`
}
