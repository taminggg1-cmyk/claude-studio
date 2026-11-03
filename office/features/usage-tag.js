// The usage tag: a small pill floating over the token rack, like a person's name tag, with the two readings as
// numbers: "ctx 42%" (how much of the context window is used) and "5h 87%" (how much of the five-hour usage limit is
// gone). Each number has a dot in its strip's colour (green, amber, hot pink); a reading Claude Code does not have
// shows "--". It reads what the rack shows (world.rack.reading()), so ?usage=60,90 on a demo page fills it too.
// See ../features.js for the hooks a feature may answer.

import { levelColour } from '../room.js'

const hex = n => '#' + n.toString(16).padStart(6, '0')

export function makeUsageTag(ctx) {
  const { THREE, camera, world } = ctx
  const layer = document.getElementById('badges')
  if (!layer || !world.rack?.anchor) return null

  const el = document.createElement('div')
  el.className = 'badge usage-tag'
  el.title = 'Token rack: context window used, and five-hour usage limit used'
  const pill = document.createElement('div')
  pill.className = 'pill'
  pill.style.padding = '4px 12px 4px 9px'
  const parts = ['ctx', '5h'].map(name => {
    const dot = document.createElement('span')
    dot.className = 'dot'
    const words = document.createElement('span')
    words.className = 'label'
    pill.append(dot, words)
    return { name, dot, words, shown: '' }
  })
  el.appendChild(pill)
  layer.appendChild(el)

  /** Writes one reading on its part of the pill, only when its words change. */
  function show(part, v) {
    const words = v === null ? `${part.name} --` : `${part.name} ${Math.round(v)}%`
    if (words === part.shown) return
    part.shown = words
    part.words.textContent = words
    part.dot.style.setProperty('--dot', v === null ? '#c9b8a4' : hex(levelColour(v)))
  }

  const at = new THREE.Vector3()
  return {
    apply() {
      const r = world.rack.reading()
      show(parts[0], r.context)
      show(parts[1], r.fiveHour)
    },
    step() {
      at.copy(world.rack.anchor).project(camera)
      const x = ((at.x + 1) / 2) * window.innerWidth
      const y = ((1 - at.y) / 2) * window.innerHeight
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      el.style.zIndex = String(Math.round(y))
      // behind the camera (a very close view turned away) the projection is meaningless
      el.style.opacity = at.z > 1 ? '0' : '1'
    },
  }
}
