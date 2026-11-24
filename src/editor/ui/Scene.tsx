import { useEffect, useRef, useState } from 'preact/hooks'
import type { Project } from '../../core/schema.ts'
import { preloadModels } from '../../room3d/models.ts'
import { RoomView, webglAvailable, type HomeData } from '../../room3d/view.ts'
import { onLangChange, t, type Key } from '../i18n.ts'
import { assetUrl } from './common.tsx'
import { iconSvg, type IconName } from './icons.tsx'

export const PRIMARY_HOTSPOTS = ['diary', 'computer', 'voice', 'pet', 'window', 'door', 'shelf', 'export']

const HOT_ICON: Record<string, IconName> = {
  diary: 'pen',
  computer: 'computer',
  voice: 'phone',
  pet: 'ghost',
  window: 'sun',
  door: 'door',
  shelf: 'book',
  export: 'download',
}

/** Turns a project (owner's full view, or a public projection) into what the 3D room needs. */
export function toHomeData(p: Project): HomeData {
  const r = p.room
  const posts = new Map(p.posts.map((x) => [x.id, x]))
  const welcome = !!r.welcomeRecordingId && p.recordings.some((x) => x.id === r.welcomeRecordingId && x.visibility === 'public')
  return {
    house: r.house,
    wall: r.wall,
    floor: r.floor,
    light: r.light,
    decor: r.decor,
    memory: r.memory.map((m) => {
      const post = posts.get(m.postId)
      const cover = post?.imageIds[0] ? p.assets.find((a) => a.id === post.imageIds[0]) : undefined
      return {
        id: m.id,
        kind: m.kind,
        slot: m.slot,
        title: post?.title || '·',
        ...(cover ? { thumbUrl: assetUrl(cover) } : {}),
      }
    }),
    welcome,
    pet: { enabled: p.ghost.enabled, name: p.ghost.name, color: p.ghost.color },
  }
}

export function hotspotLabel(id: string, titles: Map<string, string>): string {
  if (id.startsWith('memory:')) return titles.get(id.slice(7)) ?? t('kind.book')
  return t(`hot.${id}` as Key)
}

export type SceneProps = {
  data: HomeData
  hotspots: string[]
  decorate: boolean
  selected: string | null
  /** Auto-rotate slowly (used behind the setup card). */
  drift?: boolean
  onPick: (id: string) => void
  onCell?: (x: number, z: number) => void
  onView?: (v: RoomView | null) => void
}

/** The 3D room with its DOM hotspots. Falls back to nothing when WebGL is unavailable. */
export function Scene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<RoomView | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!host.current) return
    if (!webglAvailable()) {
      setFailed(true)
      props.onView?.(null)
      return
    }
    const titles = () => new Map(latest.current.data.memory.map((m) => [m.id, m.title]))
    let cancelled = false
    let cleanup = () => {}
    // The Blender models are embedded; parsing them takes a moment, then the room is built once.
    void preloadModels().then(() => {
      if (cancelled || !host.current) return
      cleanup = mount(titles)
    })
    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  function mount(titles: () => Map<string, string>): () => void {
    let view: RoomView
    try {
      view = new RoomView({
        container: host.current!,
        label: (id) => hotspotLabel(id, titles()),
        icon: (id) => iconSvg(HOT_ICON[id] ?? 'book', id.startsWith('memory:') ? 12 : 18),
        onPick: (id) => latest.current.onPick(id),
        onCell: (x, z) => latest.current.onCell?.(x, z),
        hotspots: latest.current.hotspots,
        reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      })
    } catch {
      setFailed(true)
      props.onView?.(null)
      return () => {}
    }
    viewRef.current = view
    view.setData(latest.current.data)
    view.setDecorMode(latest.current.decorate)
    props.onView?.(view)
    const off = onLangChange(() => view.refreshHotspots())
    let drift = 0
    if (props.drift) drift = window.setInterval(() => view.rotateBy(0.012), 60)
    return () => {
      off()
      window.clearInterval(drift)
      view.dispose()
      viewRef.current = null
      props.onView?.(null)
    }
  }

  useEffect(() => {
    viewRef.current?.setData(props.data)
  }, [props.data])
  useEffect(() => {
    viewRef.current?.setDecorMode(props.decorate)
  }, [props.decorate])
  useEffect(() => {
    viewRef.current?.select(props.selected)
  }, [props.selected, props.data])

  return <div class="scene" ref={host} data-webgl={failed ? 'off' : 'on'} aria-label="3D home" role="presentation" />
}

export function sceneFailed(): boolean {
  return !webglAvailable()
}
