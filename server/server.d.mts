import type { Server } from 'node:http'
import type { SiteStore } from './store.mjs'
export class RateLimiter {
  constructor(limit?: number, windowMs?: number)
  check(ip: string): boolean
}
export function createPublishServer(opts: {
  store: SiteStore
  baseUrl?: string
  rateLimit?: number
  tokenSalt: string
  trustProxy?: boolean
  corsOrigin?: string | null
}): Server
