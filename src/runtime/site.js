// Little Internet website runtime — shipped inside every generated site as site.js.
// Progressive enhancement only: every page is complete without it.
//  * Guestbook: on the live Little Internet copy (/@slug/ on the host that published it) it loads
//    approved notes and lets visitors sign. Anywhere else (an export, another host, offline) the
//    saved snapshot stays and the form stays hidden, with a note saying why.
//  * Badge code: fills in this site's absolute address and adds a copy button.
// Rules: no dependencies, no HTML strings from data (textContent only), only same-origin requests.
;(function () {
  'use strict'
  var dataEl = document.getElementById('site-data')
  var data = {}
  try {
    data = JSON.parse((dataEl && dataEl.textContent) || '{}') || {}
  } catch (e) {
    data = {}
  }
  var t = data.t || {}
  var str = function (v, max) {
    return typeof v === 'string' ? v.slice(0, max) : ''
  }

  // ---- 88×31 badge code
  var codes = document.querySelectorAll('textarea[data-badge-code]')
  for (var i = 0; i < codes.length; i++) {
    ;(function (ta) {
      if (!ta.getAttribute('data-abs') && /^https?:$/.test(location.protocol)) {
        var home = new URL(ta.getAttribute('data-prefix') || './', location.href).href
        var a = document.createElement('a')
        a.href = home
        var img = document.createElement('img')
        img.setAttribute('src', home + (ta.getAttribute('data-file') || 'button.png'))
        img.setAttribute('width', '88')
        img.setAttribute('height', '31')
        img.setAttribute('alt', ta.getAttribute('data-title') || '')
        a.appendChild(img)
        ta.value = a.outerHTML
      }
      var btn = ta.parentNode && ta.parentNode.querySelector('[data-copy]')
      if (!btn) return
      btn.hidden = false
      btn.addEventListener('click', function () {
        ta.select()
        var done = function () {
          btn.textContent = str(t.copied, 40) || 'Copied!'
          setTimeout(function () {
            btn.textContent = str(t.copy, 40) || 'Copy code'
          }, 1800)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () {})
        else {
          try {
            document.execCommand('copy')
            done()
          } catch (e) {}
        }
      })
    })(codes[i])
  }

  // ---- guestbook
  var forms = document.querySelectorAll('form[data-gb]')
  var slug = typeof data.slug === 'string' && /^[a-z0-9-]{1,32}$/.test(data.slug) ? data.slug : ''
  if (!forms.length || !slug) return
  if (location.pathname.indexOf('/@' + slug + '/') !== 0) return
  var api = location.origin + '/api/sites/' + slug + '/messages'

  var render = function (list, notes) {
    while (list.firstChild) list.removeChild(list.firstChild)
    if (!notes.length) {
      var empty = document.createElement('li')
      empty.className = 'muted'
      empty.textContent = str(t.gbEmpty, 200)
      list.appendChild(empty)
      return
    }
    for (var n = 0; n < notes.length && n < 50; n++) {
      var m = notes[n] || {}
      var li = document.createElement('li')
      var who = document.createElement('strong')
      who.textContent = str(m.name, 40) || 'Anonymous'
      var when = document.createElement('time')
      when.textContent = ' ' + str(m.createdAt, 10)
      var p = document.createElement('p')
      p.textContent = str(m.text, 300)
      li.appendChild(who)
      li.appendChild(when)
      li.appendChild(p)
      list.appendChild(li)
    }
  }

  fetch(api + '/approved', { credentials: 'omit' })
    .then(function (r) {
      if (!r.ok) throw new Error(String(r.status))
      return r.json()
    })
    .then(function (j) {
      var notes = (j && Array.isArray(j.messages) && j.messages) || []
      for (var f = 0; f < forms.length; f++) {
        ;(function (form) {
          var box = form.parentNode
          var list = box.querySelector('[data-gb-list]')
          var status = box.querySelector('[data-gb-status]')
          if (list) render(list, notes)
          if (status) status.textContent = str(t.guestHint, 300)
          form.hidden = false
          form.addEventListener('submit', function (e) {
            e.preventDefault()
            var text = form.elements.namedItem('text')
            var name = form.elements.namedItem('name')
            var trap = form.elements.namedItem('website')
            if (!text || !text.value.trim()) return
            var send = form.querySelector('button')
            if (send) send.disabled = true
            if (status) status.textContent = str(t.gbSending, 80)
            fetch(api, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'omit',
              body: JSON.stringify({ name: name ? name.value : '', text: text.value, website: trap ? trap.value : '' }),
            })
              .then(function (r) {
                if (status) status.textContent = r.ok ? str(t.thanks, 200) : str(t.sendFail, 200)
                if (r.ok) text.value = ''
              })
              .catch(function () {
                if (status) status.textContent = str(t.sendFail, 200)
              })
              .then(function () {
                if (send) send.disabled = false
              })
          })
        })(forms[f])
      }
    })
    .catch(function () {
      /* offline or not on the platform: keep the saved snapshot and the explanation */
    })
})()
