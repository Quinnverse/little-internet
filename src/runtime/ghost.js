// Little Internet website ghost — runtime shipped inside every generated site.
// States: idle, sleep, react, guide (ghost spec, Requirement 1).
// Rules: no dependencies, no network, no HTML strings from data, no platform URLs.
;(function () {
  'use strict'
  var dataEl = document.getElementById('ghost-data')
  if (!dataEl) return
  var data
  try {
    data = JSON.parse(dataEl.textContent || '')
  } catch (e) {
    return
  }
  if (!data || data.enabled !== true) return

  var str = function (v, fallback) {
    return typeof v === 'string' ? v : fallback
  }
  // Allow-list: absolute http(s) URLs, or relative refs with no scheme. Browsers strip
  // leading whitespace/control characters from hrefs (" javascript:x" runs), so relative
  // refs may not contain any, and a ':' before the first '/', '?' or '#' means a scheme.
  var safeHref = function (h) {
    if (typeof h !== 'string' || h === '') return null
    if (/^https?:\/\/[^\s\u0000-\u001f]/i.test(h)) return h
    if (/[\u0000-\u0020\u007f]/.test(h)) return null
    var sep = h.search(/[\/?#]/)
    var head = sep < 0 ? h : h.slice(0, sep)
    return head.indexOf(':') < 0 ? h : null
  }
  var COLORS = { white: 1, mint: 1, peach: 1, lilac: 1 }
  var name = str(data.name, '') || 'the ghost'
  var color = COLORS[data.color] ? data.color : 'white'
  var greeting = str(data.greeting, 'Hi!')
  var guide = []
  if (Array.isArray(data.guide)) {
    for (var gi = 0; gi < data.guide.length && guide.length < 4; gi++) {
      var item = data.guide[gi]
      var href = item && safeHref(item.href)
      if (href && typeof item.label === 'string') guide.push({ label: item.label, href: href })
    }
  }
  var latest = data.latest && safeHref(data.latest.href) && typeof data.latest.title === 'string' ? data.latest : null

  var clock = window.__ghostClock || {
    now: function () {
      return Date.now()
    },
    setTimeout: function (f, ms) {
      return window.setTimeout(f, ms)
    },
    clearTimeout: function (id) {
      window.clearTimeout(id)
    },
  }
  var SLEEP_AFTER = 20000
  var REACT_FOR = 4000
  var NEW_WITHIN = 7 * 24 * 3600 * 1000

  // ------------------------------------------------------------------ DOM
  var SVG = 'http://www.w3.org/2000/svg'
  var svgEl = function (tag, attrs) {
    var el = document.createElementNS(SVG, tag)
    for (var k in attrs) el.setAttribute(k, attrs[k])
    return el
  }

  var root = document.createElement('div')
  root.className = 'ghost-wrap'
  var button = document.createElement('button')
  button.type = 'button'
  button.className = 'ghost ghost-' + color
  button.setAttribute('aria-label', name + ' — your guide to this home')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-controls', 'ghost-bubble')

  var svg = svgEl('svg', { viewBox: '0 0 64 72', 'aria-hidden': 'true', focusable: 'false' })
  svg.appendChild(svgEl('path', { class: 'g-body', d: 'M10 66V30a22 22 0 0 1 44 0v36l-7.3-5.5-7.4 5.5-7.3-5.5-7.3 5.5-7.4-5.5z' }))
  var open = svgEl('g', { class: 'g-eyes-open' })
  open.appendChild(svgEl('circle', { cx: '24', cy: '31', r: '3.6' }))
  open.appendChild(svgEl('circle', { cx: '40', cy: '31', r: '3.6' }))
  svg.appendChild(open)
  var closed = svgEl('g', { class: 'g-eyes-closed' })
  closed.appendChild(svgEl('path', { d: 'M20 32q4 3 8 0M36 32q4 3 8 0' }))
  svg.appendChild(closed)
  svg.appendChild(svgEl('ellipse', { class: 'g-mouth', cx: '32', cy: '42', rx: '3.6', ry: '2.6' }))
  var zz = svgEl('text', { class: 'g-z', x: '50', y: '12' })
  zz.textContent = 'z'
  svg.appendChild(zz)
  button.appendChild(svg)

  var bubble = document.createElement('div')
  bubble.className = 'ghost-bubble'
  bubble.id = 'ghost-bubble'
  bubble.setAttribute('role', 'status')
  bubble.setAttribute('aria-live', 'polite')
  bubble.hidden = true

  root.appendChild(button)
  root.appendChild(bubble)

  var home = document.querySelector('[data-ghost-home]')
  if (home) home.appendChild(root)
  else {
    root.className += ' ghost-floating'
    document.body.appendChild(root)
  }

  // ------------------------------------------------------------------ bubble
  var clear = function (el) {
    while (el.firstChild) el.removeChild(el.firstChild)
  }
  var para = function (text) {
    var p = document.createElement('p')
    p.textContent = text
    return p
  }
  var link = function (text, href) {
    var a = document.createElement('a')
    a.href = href
    a.textContent = text
    return a
  }
  var showBubble = function (children) {
    clear(bubble)
    for (var i = 0; i < children.length; i++) bubble.appendChild(children[i])
    bubble.hidden = false
    // Keep the bubble on screen. Offsets use left/right (not transform) so the page's
    // scrollable width reflects the final position (CSSOM edits are allowed by the CSP).
    // It opens above the ghost, or below when there is no room above.
    bubble.style.left = ''
    bubble.style.right = ''
    root.classList.remove('ghost-below')
    if (bubble.getBoundingClientRect().top < 8) root.classList.add('ghost-below')
    var r = bubble.getBoundingClientRect()
    var vw = document.documentElement.clientWidth || window.innerWidth
    var shift = 0
    if (r.right > vw - 8) shift = vw - 8 - r.right
    if (r.left + shift < 8) shift = 8 - r.left
    if (shift) {
      if (root.classList.contains('ghost-floating')) bubble.style.right = Math.round(-shift) + 'px'
      else bubble.style.left = 'calc(50% + ' + Math.round(shift) + 'px)'
    }
  }
  var hideBubble = function () {
    bubble.hidden = true
    clear(bubble)
  }

  // ------------------------------------------------------------------ states
  var state = 'idle'
  var sleepTimer = null
  var reactTimer = null

  var setState = function (next) {
    state = next
    root.setAttribute('data-state', next)
    button.setAttribute('aria-expanded', next === 'guide' ? 'true' : 'false')
  }

  var armSleep = function () {
    if (sleepTimer !== null) clock.clearTimeout(sleepTimer)
    sleepTimer = clock.setTimeout(function () {
      sleepTimer = null
      if (state === 'idle') setState('sleep')
    }, SLEEP_AFTER)
  }

  var activity = function () {
    if (state === 'sleep') setState('idle')
    armSleep()
  }

  var openGuide = function () {
    if (reactTimer !== null) clock.clearTimeout(reactTimer)
    reactTimer = null
    var list = document.createElement('ul')
    for (var i = 0; i < guide.length; i++) {
      var li = document.createElement('li')
      li.appendChild(link(guide[i].label, guide[i].href))
      list.appendChild(li)
    }
    setState('guide')
    showBubble(guide.length ? [para(greeting), list] : [para(greeting)])
  }

  var closeGuide = function () {
    hideBubble()
    setState('idle')
    armSleep()
  }

  button.addEventListener('click', function () {
    if (state === 'guide') closeGuide()
    else openGuide()
  })

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state === 'guide') {
      closeGuide()
      button.focus()
    }
  })
  document.addEventListener('click', function (e) {
    if (state === 'guide' && !root.contains(e.target)) closeGuide()
  })
  var events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel']
  for (var ei = 0; ei < events.length; ei++) {
    document.addEventListener(events[ei], activity, { passive: true, capture: true })
  }

  setState('idle')
  armSleep()

  if (latest) {
    var age = clock.now() - Date.parse(latest.createdAt)
    if (age >= -24 * 3600 * 1000 && age <= NEW_WITHIN) {
      setState('react')
      var p = para('Something new: ')
      p.appendChild(link(latest.title || 'a new entry', latest.href))
      showBubble([p])
      reactTimer = clock.setTimeout(function () {
        reactTimer = null
        if (state === 'react') {
          hideBubble()
          setState('idle')
          armSleep()
        }
      }, REACT_FOR)
    }
  }
})()
