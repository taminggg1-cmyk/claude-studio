// The characters feature (see ../features.js for the hooks a feature may answer). A "Characters" tab in the panel lets
// people bring their own VRM models: drop a .vrm file, and the studio turns it into a character whose persona (name tag,
// colour, about text and speech lines) Claude writes. The list shows every model with its role (Claude, an agent, or
// off), its licence in plain words, and buttons to rewrite the persona, edit it by hand, or remove the model.
//
// The server side is ../server-features/characters.mjs (it keeps the files outside this repository, in the models
// folder, and sends the list as snapshot.characters); the mod writes the persona (hooks/features/characters.ts).
// Models load when the page starts, so after any change the tab offers to reload the window.
// `?characters` on a demo page shows the tab with a sample list.

import { addTab, ask, canSend, cannotSendWhy, showTab } from '../panel.js'

const MAX_BYTES = 100 * 1024 * 1024

const SAMPLE = {
  hasSession: true,
  list: [
    {
      file: 'aoi.vrm',
      name: 'Aoi',
      color: '#5b78c9',
      about: 'The lead. Calm in a crisis, and always has a plan for the next test.',
      role: 'claude',
      credit: 'Aoi by Sample Author (CC0)',
      licence: 'cc0: no limits stated',
      warning: '',
      hasPersona: true,
      writing: false,
      note: '',
    },
    {
      file: 'momo.vrm',
      name: 'Momo',
      color: '#e0457b',
      about: 'Cheerful and quick. Hums while the build runs.',
      role: 'agent',
      credit: 'Momo by Another Author (redistribution prohibited)',
      licence: 'redistribution prohibited: no violent use, no sexual use, personal, non-profit use only, no redistribution',
      warning: 'The licence limits how this model may be used (no violent use, no sexual use, personal, non-profit use only, no redistribution). Use it only in ways it allows.',
      hasPersona: true,
      lounge: true,
      writing: false,
      note: '',
    },
    {
      file: 'kuro.vrm',
      name: 'Kuro',
      color: '#8e62b8',
      about: 'A new character: Kuro by Someone.',
      role: 'agent',
      credit: 'Kuro by Someone (VRM 1.0 licence)',
      licence: 'VRM 1.0 licence: no limits stated',
      warning: '',
      hasPersona: false,
      lounge: false,
      writing: true,
      note: '',
    },
    {
      file: 'old-one.vrm',
      name: 'old-one',
      color: '#c8775a',
      about: '',
      role: 'off',
      credit: '',
      licence: 'The licence could not be read from the file.',
      warning: '',
      hasPersona: false,
      writing: false,
      note: '',
    },
  ],
}

const CSS = `
#ctl-panel .chr-drop { border: 1.5px dashed var(--card-line); border-radius: 12px; padding: 14px 10px; text-align: center; color: var(--muted); cursor: pointer; }
#ctl-panel .chr-drop.over { background: color-mix(in srgb, #c8775a 14%, transparent); color: var(--ink); }
#ctl-panel .chr-status { margin-top: 8px; color: var(--ink); font-size: 12px; line-height: 1.4; min-height: 16px; }
#ctl-panel .chr-reload { display: none; margin-top: 8px; align-items: center; gap: 8px; }
#ctl-panel .chr-reload.show { display: flex; }
#ctl-panel .chr-stage { display: none; margin-top: 8px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, #d6a23a 16%, transparent); font-size: 12px; line-height: 1.4; }
#ctl-panel .chr-stage.show { display: block; }
#ctl-panel .chr-stage label { display: flex; gap: 7px; align-items: center; color: var(--ink); margin: 6px 0; }
#ctl-panel .chr-list { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
#ctl-panel .chr-card { border: 1px solid var(--card-line); border-radius: 12px; padding: 8px 10px; }
#ctl-panel .chr-head { display: flex; align-items: center; gap: 7px; }
#ctl-panel .chr-dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
#ctl-panel .chr-name { font-weight: 700; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#ctl-panel .chr-file { color: var(--muted); font-size: 11px; }
#ctl-panel .chr-about { margin: 4px 0 0; color: var(--ink); font-size: 12px; line-height: 1.35; }
#ctl-panel .chr-small { margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.35; }
#ctl-panel .chr-warn { margin: 4px 0 0; color: #b0701d; font-size: 11.5px; line-height: 1.35; }
#ctl-panel .chr-roles, #ctl-panel .chr-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
#ctl-panel .chr-card .btn { padding: 4px 10px; font-size: 11.5px; }
#ctl-panel .chr-card .btn.on { background: color-mix(in srgb, #c8775a 40%, transparent); color: var(--ink); }
#ctl-panel .chr-size { display: flex; align-items: center; gap: 7px; margin-top: 6px; }
#ctl-panel .chr-size input[type=range] { flex: 1; min-width: 0; }
#ctl-panel .chr-size .pct { width: 40px; text-align: right; font-size: 11.5px; color: var(--ink); }
#ctl-panel .chr-edit { margin-top: 6px; }
#ctl-panel .chr-edit input[type=color] { width: 44px; height: 28px; padding: 0; border: 0; background: none; }
`

/** Builds an element: h('div', { class: 'x', onclick }, child, 'text'...). Text is always added as text, never as HTML. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else el[k] = v
  }
  for (const c of children) if (c !== undefined && c !== null && c !== false) el.append(c)
  return el
}

/** The VRM meta of a glTF JSON, as the server reads it: { title, author, licence, limits } or { error }. */
function metaOf(json) {
  const clean = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
  const v1 = json?.extensions?.VRMC_vrm?.meta
  const v0 = json?.extensions?.VRM?.meta
  const limits = []
  if (v1 && typeof v1 === 'object') {
    if (v1.avatarPermission === 'onlyAuthor') limits.push('only the author may use it')
    else if (v1.avatarPermission === 'onlyAuthorized') limits.push('only people the author has allowed may use it')
    if (v1.allowExcessivelyViolentUsage !== true) limits.push('no violent use')
    if (v1.allowExcessivelySexualUsage !== true) limits.push('no sexual use')
    if (v1.commercialUsage === 'personalNonProfit') limits.push('personal, non-profit use only')
    else if (v1.commercialUsage === 'personalProfit') limits.push('no company use')
    if (v1.allowRedistribution !== true) limits.push('no redistribution')
    return { title: clean(v1.name, 80), limits }
  }
  if (v0 && typeof v0 === 'object') {
    if (v0.allowedUserName === 'OnlyAuthor') limits.push('only the author may use it')
    else if (v0.allowedUserName === 'ExplicitlyLicensedPerson') limits.push('only people the author has allowed may use it')
    if (v0.violentUssageName !== 'Allow') limits.push('no violent use')
    if (v0.sexualUssageName !== 'Allow') limits.push('no sexual use')
    if (v0.commercialUssageName !== 'Allow') limits.push('personal, non-profit use only')
    if (/redistribution_prohibited/i.test(String(v0.licenseName))) limits.push('no redistribution')
    return { title: clean(v0.title, 80), limits }
  }
  return { error: 'That is a glTF file, but not a VRM model.' }
}

/** Reads the start of a model file to see that it is a VRM and what its licence limits. */
async function readMeta(file) {
  const head = new DataView(await file.slice(0, 20).arrayBuffer())
  if (head.byteLength < 20 || head.getUint32(0, true) !== 0x46546c67) return { error: 'That is not a .vrm model file.' }
  if (head.getUint32(4, true) !== 2) return { error: 'Only glTF version 2 files are supported.' }
  const length = head.getUint32(12, true)
  if (head.getUint32(16, true) !== 0x4e4f534a || length > 32 * 1024 * 1024 || 20 + length > file.size) return { error: 'The file looks damaged.' }
  try {
    return metaOf(JSON.parse(await file.slice(20, 20 + length).text()))
  } catch {
    return { error: 'The model description in the file cannot be read.' }
  }
}

const megabytes = n => `${Math.max(0.1, n / 1024 / 1024).toFixed(1)} MB`

export function makeCharacters(ctx) {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const demo = ctx.params.has('characters') && ctx.isDemo
  const page = addTab('characters', 'Characters')

  const input = h('input', { type: 'file', accept: '.vrm,.glb', hidden: true })
  const drop = h('div', { class: 'chr-drop', tabIndex: 0 }, 'Drop a .vrm model here, or click to choose one')
  const status = h('div', { class: 'chr-status' })
  const stage = h('div', { class: 'chr-stage' })
  const reload = h(
    'div',
    { class: 'chr-reload' },
    h('span', { class: 'note' }, 'Models load when the window starts.'),
    h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'Reload the window'),
  )
  const list = h('div', { class: 'chr-list' })
  const preview = h(
    'button',
    { type: 'button', class: 'btn plain', onclick: () => window.open('/?lineup&chatty', '_blank') },
    'Preview',
  )
  page.append(
    h('div', { class: 'note' }, 'Your models stay on this computer. Check each model\'s licence before you use it.'),
    h('div', { style: 'height:8px' }),
    drop,
    input,
    stage,
    status,
    reload,
    h('div', { class: 'row' }, h('span', { class: 'note' }, 'Preview shows everyone in a row, chatting, in a new tab.'), preview),
    list,
  )
  if (!canSend) status.textContent = cannotSendWhy

  let data = demo ? SAMPLE : { hasSession: false, list: [] }
  let signature = ''
  let editing = null
  let writingBefore = new Set()
  /** When this window last moved a size slider, by file: a snapshot that is older than that must not undo it. */
  const localAt = new Map()

  const say = text => (status.textContent = text)
  const changed = () => reload.classList.add('show')

  /** Runs a request, tells the person how it went, and offers a reload. */
  async function act(path, body, done) {
    if (!canSend) return say(cannotSendWhy)
    try {
      const res = await ask(path, body)
      say(typeof res === 'object' && res?.note ? res.note : done)
      changed()
      return res
    } catch (err) {
      say(`Not done: ${err.message || err}`)
    }
  }

  // ---------------------------------------------------------------------------------------------- uploading

  function clearStage() {
    stage.classList.remove('show')
    stage.replaceChildren()
  }

  async function upload(file, rights) {
    clearStage()
    say(`Sending ${file.name} (${megabytes(file.size)})…`)
    try {
      const res = await ask(`/characters/upload?name=${encodeURIComponent(file.name)}${rights ? '&rights=yes' : ''}`, file, { type: 'application/octet-stream' })
      say(`Saved ${res?.file || file.name}. ${res?.note || ''}`)
      changed()
    } catch (err) {
      say(`Not saved: ${err.message || err}`)
    }
  }

  async function choose(file) {
    clearStage()
    if (!file) return
    if (!canSend) return say(cannotSendWhy)
    if (!/\.(vrm|glb)$/i.test(file.name)) return say('Choose a .vrm file.')
    if (file.size > MAX_BYTES) return say(`That file is ${megabytes(file.size)}. The limit is 100 MB.`)
    say('Checking the file…')
    const meta = await readMeta(file).catch(() => ({ error: 'The file could not be read.' }))
    if (meta.error) return say(meta.error)
    if (!meta.limits.length) return upload(file, false)
    const tick = h('input', { type: 'checkbox' })
    const go = h('button', { type: 'button', class: 'btn', disabled: true, onclick: () => upload(file, true) }, 'Upload')
    tick.addEventListener('change', () => (go.disabled = !tick.checked))
    stage.replaceChildren(
      h('div', {}, `This model's licence limits its use: ${meta.limits.join(', ')}.`),
      h('label', {}, tick, 'I have the right to use this model here'),
      h('div', { class: 'chr-actions' }, go, h('button', { type: 'button', class: 'btn plain', onclick: () => (clearStage(), say('')) }, 'Cancel')),
    )
    stage.classList.add('show')
    say(`${file.name} (${megabytes(file.size)}) is ready once you confirm.`)
  }

  drop.addEventListener('click', () => input.click())
  drop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      input.click()
    }
  })
  input.addEventListener('change', () => {
    void choose(input.files?.[0])
    input.value = ''
  })
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, e => (e.preventDefault(), drop.classList.add('over')))
  drop.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop.addEventListener('drop', e => {
    e.preventDefault()
    drop.classList.remove('over')
    void choose(e.dataTransfer?.files?.[0])
  })

  // ---------------------------------------------------------------------------------------------- the list

  const ROLES = [
    ['claude', 'Claude'],
    ['agent', 'Agent'],
    ['off', 'Off'],
  ]

  function editor(c) {
    const name = h('input', { value: c.name, maxLength: 24, spellcheck: false })
    const colour = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#c8775a' })
    const about = h('textarea', { value: c.about, maxLength: 200 })
    return h(
      'div',
      { class: 'chr-edit' },
      h('label', {}, 'Name on the name tag'),
      name,
      h('label', {}, 'Colour'),
      colour,
      h('label', {}, 'About (shown when you click them)'),
      about,
      h(
        'div',
        { class: 'chr-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            disabled: !canSend,
            onclick: async () => {
              const res = await act('/characters/persona', { file: c.file, persona: { name: name.value, color: colour.value, about: about.value } }, `Saved ${name.value}.`)
              if (res) {
                editing = null
                signature = ''
                render()
              }
            },
          },
          'Save',
        ),
        h('button', { type: 'button', class: 'btn plain', onclick: () => ((editing = null), (signature = ''), render()) }, 'Cancel'),
      ),
    )
  }

  /** A size slider for one character: shows live in the window at once, and is saved when the person lets go. */
  function sizeRow(c) {
    const now = () => ctx.size?.chars?.[c.file] ?? c.scale ?? 1
    const bar = h('input', { type: 'range', min: '0.7', max: '2', step: '0.01', value: String(now()), title: 'How big this character stands' })
    const pct = h('span', { class: 'pct' }, `${Math.round(now() * 100)}%`)
    const set = value => {
      bar.value = String(value)
      pct.textContent = `${Math.round(value * 100)}%`
      if (ctx.size) ctx.size.chars[c.file] = value
      localAt.set(c.file, Date.now())
    }
    const save = async value => {
      if (!canSend) return
      try {
        await ask('/characters/scale', { file: c.file, scale: value })
        say(`${c.name} is now ${Math.round(value * 100)}% size.`)
      } catch (err) {
        // the office did not keep it: go back to the saved size now, and say so, rather than quietly a moment later
        localAt.delete(c.file)
        const saved = Number.isFinite(c.scale) ? c.scale : 1
        set(saved)
        localAt.delete(c.file)
        say(`Not saved (${err.message || err}), so ${c.name} went back to ${Math.round(saved * 100)}%. Type /office in Claude Code if this keeps happening.`)
      }
    }
    bar.addEventListener('input', () => set(Number(bar.value)))
    bar.addEventListener('change', () => save(Number(bar.value)))
    const reset = h('button', { type: 'button', class: 'btn plain', title: 'Back to the normal size', onclick: () => (set(1), save(1)) }, 'Reset')
    return h('div', { class: 'chr-size' }, h('span', { class: 'chr-small' }, 'Size'), bar, pct, reset)
  }

  /**
   * Whether this agent hangs out in the lounge while it is not working. The room follows at once (no reload): they
   * walk in, or walk out of the door.
   */
  function loungeRow(c) {
    const set = async on => {
      if (!canSend) return say(cannotSendWhy)
      try {
        await ask('/characters/lounge', { file: c.file, on })
        say(on ? `${c.name} will hang out in the lounge.` : `${c.name} will only come in to work.`)
        if (demo) {
          c.lounge = on
          signature = ''
          render()
        }
      } catch (err) {
        say(`Not done: ${err.message || err}`)
      }
    }
    return h(
      'div',
      { class: 'chr-roles', title: 'People off duty sit in the lounge. When Claude starts an agent, one of them gets up and comes to work.' },
      h('span', { class: 'chr-small' }, 'Lounge'),
      h('button', { type: 'button', class: `btn plain${c.lounge ? ' on' : ''}`, disabled: !canSend || !!c.lounge, onclick: () => set(true) }, 'Hang out'),
      h('button', { type: 'button', class: `btn plain${c.lounge ? '' : ' on'}`, disabled: !canSend || !c.lounge, onclick: () => set(false) }, 'Only for work'),
    )
  }

  function card(c) {
    const removeBtn = h('button', { type: 'button', class: 'btn plain', disabled: !canSend }, 'Remove')
    let sure = false
    removeBtn.addEventListener('click', async () => {
      if (!sure) {
        sure = true
        removeBtn.textContent = 'Really remove?'
        return
      }
      await act('/characters/remove', { file: c.file }, `${c.file} was moved to the removed folder.`)
    })
    return h(
      'div',
      { class: 'chr-card' },
      h('div', { class: 'chr-head' }, h('span', { class: 'chr-dot', style: `background:${/^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#c8775a'}` }), h('span', { class: 'chr-name' }, c.name), h('span', { class: 'chr-file' }, c.file)),
      c.about ? h('p', { class: 'chr-about' }, c.about) : null,
      sizeRow(c),
      c.writing ? h('p', { class: 'chr-small' }, 'Claude is writing a persona…') : c.note ? h('p', { class: 'chr-warn' }, c.note) : null,
      h(
        'div',
        { class: 'chr-roles' },
        ...ROLES.map(([role, title]) =>
          h(
            'button',
            { type: 'button', class: `btn plain${c.role === role ? ' on' : ''}`, disabled: !canSend || c.role === role, onclick: () => act('/characters/role', { file: c.file, role }, `${c.name} is now ${title === 'Off' ? 'off' : `${title === 'Agent' ? 'an agent' : title}`}.`) },
            title,
          ),
        ),
      ),
      // (an office server started before the lounge existed sends no `lounge` field and has no route to save it)
      c.role === 'agent' && typeof c.lounge === 'boolean' ? loungeRow(c) : null,
      h('p', { class: 'chr-small' }, c.credit || 'No credit line.'),
      h('p', { class: 'chr-small' }, `Licence: ${c.licence}`),
      c.warning ? h('p', { class: 'chr-warn' }, c.warning) : null,
      editing === c.file
        ? editor(c)
        : h(
            'div',
            { class: 'chr-actions' },
            h(
              'button',
              {
                type: 'button',
                class: 'btn plain',
                disabled: !canSend || c.writing,
                onclick: () => act('/characters/rewrite', { file: c.file }, 'Asked Claude to write a new persona.'),
              },
              'Rewrite persona',
            ),
            h('button', { type: 'button', class: 'btn plain', onclick: () => ((editing = c.file), (signature = ''), render()) }, 'Edit'),
            removeBtn,
          ),
    )
  }

  function render() {
    const rows = data.list || []
    const sig = JSON.stringify([rows, data.hasSession, editing, canSend])
    if (sig === signature) return
    // do not rebuild the list while a field in it has the focus
    const focus = document.activeElement
    if (editing && focus && list.contains(focus) && /^(INPUT|TEXTAREA)$/.test(focus.tagName)) return
    if (focus && list.contains(focus) && focus.type === 'range') return
    signature = sig
    const writing = new Set(rows.filter(r => r.writing).map(r => r.file))
    for (const f of writingBefore) if (!writing.has(f)) changed()
    writingBefore = writing
    if (!rows.length) list.replaceChildren(h('p', { class: 'note' }, 'No models yet. Without any, the studio uses its built-in characters.'))
    else list.replaceChildren(...rows.map(card))
    if (!data.hasSession && rows.length) list.append(h('p', { class: 'note' }, 'No Claude session is in the office, so new personas cannot be written right now.'))
  }

  render()
  if (demo) showTab('characters')

  return {
    apply(snapshot) {
      if (!demo) data = snapshot?.characters || data
      // everyone wearing a model takes its saved size, live (not while this window is moving that slider)
      if (ctx.size)
        for (const r of data.list || []) {
          if (Date.now() - (localAt.get(r.file) || 0) < 4000) continue
          const s = Number.isFinite(r.scale) ? r.scale : 1
          if (ctx.size.chars[r.file] !== s && !(s === 1 && ctx.size.chars[r.file] === undefined)) ctx.size.chars[r.file] = s
        }
      try {
        render()
      } catch (err) {
        console.warn('studio: the characters list did not draw:', err)
      }
    },
  }
}
