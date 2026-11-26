import { useEffect, useState } from 'preact/hooks'
import { getLang } from '../i18n.ts'

const ZH = ['夜深了', '清晨好', '上午好', '午后好', '傍晚好', '晚上好']
const EN = ['Late night', 'Good morning', 'Good morning', 'Good afternoon', 'Good evening', 'Good evening']

/** Where in the day the home currently is — the world keeps its own quiet time. */
function phase(hour: number) {
  if (hour < 5) return 0
  if (hour < 11) return 1
  if (hour < 12) return 2
  if (hour < 17) return 3
  if (hour < 19) return 4
  return 5
}

/** A small living clock. No data leaves the device; it only reads the local time. */
export function LivingClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  const h = now.getHours()
  const zh = getLang() === 'zh'
  const greeting = zh ? ZH[phase(h)] : EN[phase(h)]
  const time = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return (
    <div class="living-clock" aria-label={zh ? '家里的时钟' : 'Home clock'}>
      <span class="lc-dot" aria-hidden="true" />
      <span class="lc-time">{time}</span>
      <span class="lc-greet">{greeting}</span>
    </div>
  )
}
