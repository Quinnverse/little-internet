// Little Internet website ghost — runtime shipped inside every exported site.
// Placeholder until the ghost spec: shows the ghost and its guide links.
// Must stay dependency-free and must not reference any platform URL.
(function () {
  'use strict'
  var dataEl = document.getElementById('ghost-data')
  if (!dataEl) return
  var data
  try {
    data = JSON.parse(dataEl.textContent || '{}')
  } catch (e) {
    return
  }
  if (!data || !data.enabled) return

  var ghost = document.createElement('button')
  ghost.type = 'button'
  ghost.className = 'ghost ghost-' + data.color + ' ghost-idle'
  ghost.setAttribute('aria-label', data.name + ', your guide')
  ghost.setAttribute('aria-expanded', 'false')

  var bubble = document.createElement('div')
  bubble.className = 'ghost-bubble'
  bubble.hidden = true
  var hello = document.createElement('p')
  hello.textContent = data.greeting
  bubble.appendChild(hello)
  var list = document.createElement('ul')
  ;(data.guide || []).forEach(function (item) {
    var li = document.createElement('li')
    var a = document.createElement('a')
    a.href = item.href
    a.textContent = item.label
    li.appendChild(a)
    list.appendChild(li)
  })
  bubble.appendChild(list)

  ghost.addEventListener('click', function () {
    bubble.hidden = !bubble.hidden
    ghost.setAttribute('aria-expanded', String(!bubble.hidden))
  })

  var home = document.querySelector('[data-ghost-home]') || document.body
  home.appendChild(ghost)
  home.appendChild(bubble)
})()
