// Inline SVG icons (Requirement 9.4): identical on every OS, no emoji font needed.
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-5h4v5',
  book: 'M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5zM5 17.5A2.5 2.5 0 0 1 7.5 15H18M9 8.5h5',
  door: 'M6 21V4h10v17M4 21h16M13 12.5v.01M16 4l3 1.5V21',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-1.8 1l-.3 2H10.8l-.3-2a7 7 0 0 1-1.8-1l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-2.1L5 10.2l1.8-3.1 1.9.7a7 7 0 0 1 1.8-1l.3-2h3.4l.3 2a7 7 0 0 1 1.8 1l1.9-.7 1.8 3.1-1.6 1.2a7 7 0 0 1 0 2.1z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z',
  plus: 'M12 5v14M5 12h14',
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
