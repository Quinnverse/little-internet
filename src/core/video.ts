import { VIMEO_ID_PATTERN, YOUTUBE_ID_PATTERN, type VideoEmbed } from './schema.ts'

export const VIDEO_FRAME_HOSTS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com']

/** Turns a pasted YouTube/Vimeo link into a validated embed, or null. */
export function parseVideoUrl(input: string): VideoEmbed | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
  const parts = u.pathname.split('/').filter(Boolean)

  let youtubeId: string | null | undefined
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') youtubeId = u.searchParams.get('v')
    else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') youtubeId = parts[1]
  } else if (host === 'youtu.be') {
    youtubeId = parts[0]
  }
  if (youtubeId && YOUTUBE_ID_PATTERN.test(youtubeId)) {
    return { provider: 'youtube', videoId: youtubeId }
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const candidate = host === 'vimeo.com' ? parts[0] : parts[0] === 'video' ? parts[1] : undefined
    if (candidate && VIMEO_ID_PATTERN.test(candidate)) {
      return { provider: 'vimeo', videoId: candidate }
    }
  }
  return null
}

export function embedSrc(v: VideoEmbed): string {
  return v.provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${v.videoId}`
    : `https://player.vimeo.com/video/${v.videoId}`
}
