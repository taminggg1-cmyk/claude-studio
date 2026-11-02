// The decorate feature: people restyle the room. A "Design" tab in the panel offers theme presets, a colour picker per
// part of the room, the floor, the furniture styles and the warmth of the lamps. Every change shows live in this
// window; "Save" sends it to the office server so every window shows it, "Reset" goes back to the cosy loft, and
// "Export" and "Import" move a design in and out of a .json file so designs can be shared. The server keeps the saved
// design (server-features/decorate.mjs) and sends it with every update as snapshot.room (null while it is the loft).
// The room itself restyles through world.design (room.js). `?design=<theme id>` shows a theme on a demo page.

import { addTab, ask, canSend, cannotSendWhy, isBusy } from '../panel.js'
import { COLOR_KEYS, DEFAULT_DESIGN, FLOORS, PEOPLE_SIZE, THEMES, VARIANTS, checkDesign, themeDesign } from '../design.js'

const CSS = `
.dz-themes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin: 4px 0 8px; }
.dz-theme {
  display: flex; flex-direction: column; gap: 5px; align-items: flex-start; padding: 7px 8px; cursor: pointer;
  border: 1px solid var(--card-line); border-radius: 10px; background: transparent; color: var(--ink); font: inherit; font-weight: 600; text-align: left;
}
.dz-theme.on { border-color: #c8775a; background: color-mix(in srgb, #c8775a 12%, transparent); }
.dz-theme .dots { display: flex; gap: 3px; }
.dz-theme .dots i { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0, 0, 0, 0.15); }
.dz-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; margin-top: 4px; }
.dz-colors label { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin: 2px 0; }
.dz-colors input[type=color] { width: 34px; height: 24px; padding: 0; border: 1px solid var(--card-line); border-radius: 6px; background: none; cursor: pointer; }
.dz-two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 10px; }
.dz-check { display: flex !important; align-items: center; gap: 6px; margin-top: 10px !important; }
.dz-range { width: 100%; }
.dz-head { margin: 10px 2px 2px; font-weight: 700; font-size: 11.5px; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted); }
`

const el = (tag, props = {}, ...kids) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...kids)
  return node
}

export function makeDecorate(ctx) {
  const world = ctx.world
  if (!world?.design) return {}
  const style = document.head.appendChild(el('style', { textContent: CSS }))
  void style

  /** The design shown now: what the controls edit. */
  let draft = JSON.parse(JSON.stringify(DEFAULT_DESIGN))
  /** What the server last told us (as text), so only a change is applied. */
  let serverKey = null
  /** A saved design that arrived while the person was busy in the panel. */
  let waiting
  let hasWaiting = false
  const forced = new URLSearchParams(location.search).get('design')

  const show = () => {
    if (ctx.size) ctx.size.people = draft.people ?? 1
    const why = world.design.apply(draft)
    if (why) note(why)
  }

  // ------------------------------------------------------------------------------------------ the tab
  const page = addTab('design', 'Design', () => sync())
  const status = el('div', { className: 'note' })
  const note = words => (status.textContent = words)

  const themeButtons = new Map()
  const themeBox = el('div', { className: 'dz-themes' })
  for (const t of THEMES) {
    const dots = el('span', { className: 'dots' })
    for (const k of ['walls', 'accent', 'accent2', 'sofa']) dots.append(el('i', { style: `background:${t.design.colors[k]}` }))
    const b = el('button', { type: 'button', className: 'dz-theme', title: `Use the ${t.name} theme` }, dots, el('span', { textContent: t.name }))
    b.addEventListener('click', () => {
      draft = themeDesign(t.id)
      show()
      sync()
      note(`${t.name} is showing here. Press Save to keep it for every window.`)
    })
    themeButtons.set(t.id, b)
    themeBox.append(b)
  }

  const colorInputs = new Map()
  const colorBox = el('div', { className: 'dz-colors' })
  for (const [key, title] of COLOR_KEYS) {
    const input = el('input', { type: 'color', title })
    input.addEventListener('input', () => {
      draft.colors[key] = input.value
      show()
    })
    colorInputs.set(key, input)
    colorBox.append(el('label', {}, el('span', { textContent: title.replace(/ \(.*\)/, '') }), input))
  }

  const select = (title, options, get, set) => {
    const s = el('select')
    for (const [value, words] of options) s.append(el('option', { value, textContent: words }))
    s.addEventListener('change', () => {
      set(s.value)
      show()
    })
    const box = el('div', {}, el('label', { textContent: title }), s)
    return { box, sync: () => (s.value = get()) }
  }
  const floorSel = select('Floor', FLOORS, () => draft.floor, v => (draft.floor = v))
  const slotSels = [
    select('Sofa', VARIANTS.sofa, () => draft.variants.sofa, v => (draft.variants.sofa = v)),
    select('Rug', VARIANTS.rug, () => draft.variants.rug, v => (draft.variants.rug = v)),
    select('Plants', VARIANTS.plants, () => draft.variants.plants, v => (draft.variants.plants = v)),
    select('Lamps', VARIANTS.lamps, () => draft.variants.lamps, v => (draft.variants.lamps = v)),
  ]
  const slotBox = el('div', { className: 'dz-two' }, floorSel.box, ...slotSels.map(s => s.box))

  const poster = el('input', { type: 'checkbox' })
  poster.addEventListener('change', () => {
    draft.variants.poster = poster.checked
    show()
  })
  const posterRow = el('label', { className: 'dz-check' }, poster, el('span', { textContent: 'Hang the poster' }))

  const warmth = el('input', { type: 'range', min: '0', max: '1', step: '0.01', className: 'dz-range' })
  warmth.addEventListener('input', () => {
    draft.light = Number(warmth.value)
    show()
  })

  const peopleBar = el('input', { type: 'range', min: String(PEOPLE_SIZE.min), max: String(PEOPLE_SIZE.max), step: '0.01', className: 'dz-range' })
  const peopleValue = el('span', { textContent: '100%' })
  const showPeople = () => (peopleValue.textContent = `${Math.round((draft.people ?? 1) * 100)}%`)
  peopleBar.addEventListener('input', () => {
    draft.people = Number(peopleBar.value)
    showPeople()
    show()
  })

  const importer = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' })
  importer.addEventListener('change', async () => {
    const file = importer.files?.[0]
    importer.value = ''
    if (!file) return
    if (file.size > 65_536) return note('That file is too big to be a room design.')
    let data
    try {
      data = JSON.parse(await file.text())
    } catch {
      return note('That file is not valid JSON.')
    }
    const got = checkDesign(data)
    if (!got.ok) return note(`Not a room design: ${got.error}`)
    draft = got.design
    show()
    sync()
    note('Imported. It shows here; press Save to keep it for every window.')
  })

  const button = (words, plain, onClick, title) => {
    const b = el('button', { type: 'button', className: plain ? 'btn plain' : 'btn', textContent: words, title })
    b.addEventListener('click', onClick)
    return b
  }
  const saveButton = button('Save', false, async () => {
    try {
      await ask('/room', draft)
      note('Saved. Every window shows this room now.')
    } catch (err) {
      note(String(err?.message || err))
    }
  })
  saveButton.disabled = !canSend
  const resetButton = button('Reset', true, async () => {
    draft = JSON.parse(JSON.stringify(DEFAULT_DESIGN))
    show()
    sync()
    if (!canSend) return note('Back to the cosy loft in this window.')
    try {
      await ask('/room/reset', {})
      note('Back to the cosy loft in every window.')
    } catch (err) {
      note(String(err?.message || err))
    }
  }, 'Go back to the cosy loft')
  const exportButton = button('Export', true, () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }))
    const a = el('a', { href: url, download: `studio-room-${draft.theme}.json` })
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    note('Saved as a .json file you can share.')
  }, 'Download this design as a file')
  const importButton = button('Import', true, () => importer.click(), 'Load a design from a file')

  page.append(
    el('div', { className: 'dz-head', textContent: 'Theme' }),
    themeBox,
    el('div', { className: 'dz-head', textContent: 'Colours' }),
    colorBox,
    el('div', { className: 'dz-head', textContent: 'Floor and furniture' }),
    slotBox,
    posterRow,
    el('div', { className: 'dz-head', textContent: 'Lamp light (cool to warm)' }),
    warmth,
    el('div', { className: 'dz-head' }, "People's size ", peopleValue),
    peopleBar,
    el('div', { className: 'row' }, saveButton, resetButton, exportButton, importButton, importer),
    el('div', { className: 'row' }, status),
  )
  if (!canSend) note(`You can try designs here. ${cannotSendWhy}`)

  /** Puts the draft into the controls. */
  function sync() {
    for (const [id, b] of themeButtons) b.classList.toggle('on', id === draft.theme)
    for (const [key, input] of colorInputs) input.value = draft.colors[key]
    floorSel.sync()
    for (const s of slotSels) s.sync()
    poster.checked = draft.variants.poster
    warmth.value = String(draft.light)
    peopleBar.value = String(draft.people ?? 1)
    showPeople()
  }
  sync()

  /** Shows a design the server sent (null for the loft). */
  const take = saved => {
    draft = saved ? checkDesign(saved).design || draft : JSON.parse(JSON.stringify(DEFAULT_DESIGN))
    show()
    sync()
  }

  // ------------------------------------------------------------------------------------------ the demo switch
  if (ctx.isDemo && forced) {
    const t = THEMES.find(x => x.id === forced)
    if (t) {
      draft = themeDesign(t.id)
      show()
      sync()
    }
  }
  // ?size=<0.7..2> sets the people's size on a demo page
  const forcedSize = Number(new URLSearchParams(location.search).get('size'))
  if (ctx.isDemo && forcedSize >= PEOPLE_SIZE.min && forcedSize <= PEOPLE_SIZE.max) {
    draft.people = forcedSize
    show()
    sync()
  }

  return {
    apply(snapshot) {
      if ((forced || forcedSize) && ctx.isDemo) return // a demo page shows the theme it was asked for
      if (!snapshot || !('room' in snapshot)) return
      const key = JSON.stringify(snapshot.room)
      if (key === serverKey && !hasWaiting) return
      if (key !== serverKey) {
        waiting = snapshot.room
        hasWaiting = true
      }
      if (isBusy()) return // the person is working in the panel: show it when they stop
      serverKey = key
      hasWaiting = false
      take(waiting)
    },
  }
}
