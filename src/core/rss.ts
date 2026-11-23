import { escapeXml } from './escape.ts'
import type { Project } from './schema.ts'

/**
 * RSS 2.0 for an already public, normalized project.
 * With a base URL, item links are absolute (what feed readers need); without, relative.
 */
export function generateFeed(pub: Project, baseUrl?: string): string {
  const base = baseUrl ?? ''
  const channelLink = baseUrl ? baseUrl : 'index.html'
  const items = pub.posts
    .filter((p) => p.visibility === 'public')
    .map((p) => {
      const link = `${base}posts/${p.slug}.html`
      return [
        '<item>',
        `<title>${escapeXml(p.title)}</title>`,
        `<link>${escapeXml(link)}</link>`,
        `<guid isPermaLink="false">${escapeXml(`${pub.site.slug}:${p.id}`)}</guid>`,
        `<pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>`,
        `<description>${escapeXml(p.body)}</description>`,
        '</item>',
      ].join('')
    })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    `<title>${escapeXml(pub.site.title)}</title>`,
    `<link>${escapeXml(channelLink)}</link>`,
    `<description>${escapeXml(pub.site.tagline || pub.site.title)}</description>`,
    '<generator>Little Internet</generator>',
    ...items,
    '</channel></rss>',
    '',
  ].join('\n')
}
