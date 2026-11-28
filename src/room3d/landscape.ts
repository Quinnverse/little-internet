/**
 * What is outside the window.
 *
 * This used to be three flat triangles of green with a row of little boxes on top, which read as a
 * poster taped to the glass: every layer had the same contrast, sharpness and saturation. A view has
 * depth because distance eats contrast — so each ridge is drawn onto its own buffer, blurred by how
 * far away it is, then veiled with a band of haze before the next one lands.
 */
export function windowLandscape(width: number, height: number, period: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')!
  const night = period === 'midnight'
  const dusk = period === 'dusk'
  const morning = period === 'morning'

  let seed = 9725
  const random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296)

  const sky = g.createLinearGradient(0, 0, 0, height * 0.9)
  if (night) {
    sky.addColorStop(0, '#0d1128')
    sky.addColorStop(0.55, '#1c2140')
    sky.addColorStop(0.9, '#3b3552')
  } else if (dusk) {
    sky.addColorStop(0, '#5f5b86')
    sky.addColorStop(0.5, '#a97f97')
    sky.addColorStop(0.85, '#e9a983')
  } else if (morning) {
    sky.addColorStop(0, '#9fb3bd')
    sky.addColorStop(0.55, '#cfd4cd')
    sky.addColorStop(0.85, '#f4e4c6')
  } else {
    sky.addColorStop(0, '#6d9db4')
    sky.addColorStop(0.5, '#b9cfc7')
    sky.addColorStop(0.85, '#f6dcb2')
  }
  g.fillStyle = sky
  g.fillRect(0, 0, width, height)

  if (night) {
    for (let i = 0; i < 1200; i++) {
      const x = random() * width
      const y = random() * height * 0.7
      const s = random() * 1.3 + 0.3
      g.fillStyle = `rgba(240,232,214,${0.12 + random() * 0.7})`
      g.fillRect(x, y, s, s)
    }
    const mx = width * 0.72
    const my = height * 0.24
    const moon = g.createRadialGradient(mx, my, 2, mx, my, width * 0.22)
    moon.addColorStop(0, 'rgba(226,232,246,0.5)')
    moon.addColorStop(0.3, 'rgba(190,205,232,0.14)')
    moon.addColorStop(1, 'rgba(190,205,232,0)')
    g.fillStyle = moon
    g.fillRect(0, 0, width, height * 0.7)
  } else {
    const sx = width * (morning ? 0.62 : dusk ? 0.34 : 0.5)
    const sy = height * 0.64
    const glow = g.createRadialGradient(sx, sy, 2, sx, sy, width * (dusk ? 0.5 : 0.62))
    glow.addColorStop(0, dusk ? 'rgba(255,214,168,0.8)' : 'rgba(255,240,206,0.62)')
    glow.addColorStop(0.35, dusk ? 'rgba(255,190,150,0.28)' : 'rgba(250,224,180,0.2)')
    glow.addColorStop(1, 'rgba(250,224,180,0)')
    g.fillStyle = glow
    g.fillRect(0, 0, width, height)
  }

  // Cloud bands on their own buffer so one blur covers all of them.
  const cloudLayer = document.createElement('canvas')
  cloudLayer.width = width
  cloudLayer.height = height
  const cg = cloudLayer.getContext('2d')!
  for (let i = 0; i < 9; i++) {
    const y = height * (0.1 + random() * 0.4)
    const w = width * (0.3 + random() * 0.5)
    const h = height * (0.018 + random() * 0.032)
    cg.beginPath()
    cg.ellipse(random() * width, y, w, h, 0, 0, Math.PI * 2)
    cg.fillStyle = night ? 'rgba(180,192,220,0.05)' : dusk ? 'rgba(255,206,188,0.1)' : 'rgba(255,252,244,0.16)'
    cg.fill()
  }
  cg.filter = 'blur(9px)'
  g.drawImage(cloudLayer, 0, 0)

  // Four ridges. Distant ones are pale, blurred, and laid down at low opacity.
  const ridgeCols = night
    ? ['#2c2b45', '#232639', '#171c2a', '#0f1420']
    : dusk
      ? ['#a8818f', '#8a6f7f', '#6d5f6d', '#4f4b58']
      : morning
        ? ['#b9beb3', '#9aa79f', '#7c8e88', '#5d726d']
        : ['#b3bcae', '#93a79a', '#71877f', '#526761']

  for (let layer = 0; layer < 4; layer++) {
    const depth = layer / 3
    const ridge = document.createElement('canvas')
    ridge.width = width
    ridge.height = height
    const rg = ridge.getContext('2d')!
    rg.beginPath()
    const base = 0.6 + depth * 0.14
    for (let i = 0; i <= 90; i++) {
      const t = i / 90
      const y = base + 0.034 * Math.sin(t * (7 - layer * 1.4) + layer * 1.1) + 0.024 * Math.cos(t * (13 + layer) - layer) + random() * 0.012
      rg.lineTo(t * width, y * height)
    }
    rg.lineTo(width, height)
    rg.lineTo(0, height)
    rg.closePath()
    rg.fillStyle = ridgeCols[layer]
    rg.fill()
    rg.filter = `blur(${Math.max(0.3, 3.4 - depth * 3)}px)`
    g.globalAlpha = 0.5 + depth * 0.5
    g.drawImage(ridge, 0, 0)
    g.globalAlpha = 1

    const haze = g.createLinearGradient(0, height * (base - 0.14), 0, height * (base + 0.06))
    haze.addColorStop(0, 'rgba(255,248,232,0)')
    haze.addColorStop(0.5, night ? 'rgba(120,132,170,0.09)' : 'rgba(255,246,226,0.15)')
    haze.addColorStop(1, 'rgba(255,248,232,0)')
    g.fillStyle = haze
    g.fillRect(0, 0, width, height)
  }

  // A far-off town: points of light, not cardboard boxes.
  for (let i = 0; i < 26; i++) {
    const x = random() * width
    const y = height * (0.9 + random() * 0.045)
    const w = width * (0.012 + random() * 0.02)
    g.fillStyle = night ? '#131a26' : dusk ? '#5d5763' : '#5a6a66'
    g.fillRect(x, y, w, height - y)
    if (night || dusk) {
      g.fillStyle = 'rgba(246,206,146,0.8)'
      g.fillRect(x + w * 0.3, y + 5, 1.6, 2.2)
    }
  }

  const bloom = g.createRadialGradient(width * 0.5, height * 0.55, width * 0.1, width * 0.5, height * 0.55, width * 0.75)
  bloom.addColorStop(0, 'rgba(255,244,222,0.1)')
  bloom.addColorStop(1, 'rgba(255,244,222,0)')
  g.fillStyle = bloom
  g.fillRect(0, 0, width, height)

  const vig = g.createRadialGradient(width * 0.5, height * 0.5, width * 0.28, width * 0.5, height * 0.5, width * 0.78)
  vig.addColorStop(0, 'rgba(28,22,16,0)')
  vig.addColorStop(1, 'rgba(28,22,16,0.26)')
  g.fillStyle = vig
  g.fillRect(0, 0, width, height)

  for (let i = 0; i < 2400; i++) {
    g.fillStyle = `rgba(255,255,255,${random() * 0.03})`
    g.fillRect(random() * width, random() * height, 1, 1)
  }
  return canvas
}
