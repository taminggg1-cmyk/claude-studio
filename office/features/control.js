// The control feature: the panel's first three tabs, for asking things of the office without going to a terminal.
// It can send a prompt to one session's Claude (as if you typed it at that session's prompt), start an agent in one
// session, or open a new terminal running Claude Code in a folder (a new session, whose Claude then walks in),
// optionally with Remote Control turned on so the session can be reached from a phone or tablet.
//
// The panel itself and the page key live in ../panel.js. The mod's side is hooks/features/control.ts (it picks up
// prompts and agents from the server's inbox); the server's side is POST /command and POST /new-session in server.mjs.

import { addTab, ask, canSend, cannotSendWhy, isBusy } from '../panel.js'

const AGENT_TYPES = ['general-purpose', 'Explore', 'Plan']

export function makeControl(ctx) {
  let sessions = []
  let folders = []
  /** The characters the server lists (name, role), by model file; the page can dress agents only in models it loaded. */
  let listed = new Map()

  const askPage = addTab('ask', 'Ask Claude', () => refreshLists())
  askPage.innerHTML = `
    <label>Session</label><select class="session"></select>
    <label>Your prompt</label><textarea class="text" placeholder="What should Claude do?"></textarea>
    <div class="row"><span class="note"></span><button type="button" class="send">Send</button></div>`
  const agentPage = addTab('agent', 'Add an agent')
  agentPage.innerHTML = `
    <label>Session</label><select class="session"></select>
    <label>Kind of agent</label><select class="kind">${AGENT_TYPES.map(t => `<option>${t}</option>`).join('')}</select>
    <label>Character</label><select class="character"></select>
    <label>Its task</label><textarea class="text" placeholder="What should the agent find out or do?"></textarea>
    <div class="row"><span class="note"></span><button type="button" class="send">Start</button></div>`
  const newPage = addTab('new', 'New session')
  newPage.innerHTML = `
    <label>Folder</label><select class="folder"></select>
    <input class="path" placeholder="or type a folder, e.g. C:\\Users\\you\\project" spellcheck="false" />
    <label style="display:flex;gap:7px;align-items:center;color:var(--ink);margin-top:9px">
      <input type="checkbox" class="remote" /> Remote Control (reach it from your phone or tablet)
    </label>
    <div class="row"><span class="note"></span><button type="button" class="send">Open</button></div>`
  const pages = [askPage, agentPage, newPage]

  const note = (page, text) => (page.querySelector('.note').textContent = text)
  for (const page of pages) {
    if (!canSend) note(page, cannotSendWhy)
    page.querySelector('.send').disabled = !canSend
  }

  /** The session a person clicked last (their card is open), so the panel starts on it. */
  const chosen = () => {
    for (const entry of ctx.people.values()) if (entry.open && entry.info.session !== undefined) return entry.info.session
    return null
  }
  function leadName(s) {
    for (const entry of ctx.people.values()) if (entry.isLead && entry.info.session === s.id) return entry.persona?.name || 'Claude'
    return 'Claude'
  }
  /** The characters an agent can wear: every model this page loaded (Claude's own included), named by its persona. */
  function refreshCharacters() {
    const select = agentPage.querySelector('select.character')
    const was = select.value
    select.innerHTML = '<option value="">Any free character</option>'
    const models = ctx.models
    if (!models) return
    const worn = new Set([...ctx.people.values()].filter(e => e.state !== 'leaving').map(e => e.model))
    for (const file of [...new Set([...models.agents, models.claude].filter(Boolean))]) {
      if (listed.get(file)?.role === 'off') continue
      const opt = document.createElement('option')
      opt.value = file
      const name = models.personas?.[file]?.name || listed.get(file)?.name || file.replace(/\.(vrm|glb)$/i, '')
      opt.textContent = `${name}${file === models.claude ? " (Claude's own)" : ''}${worn.has(file) ? ' · in the room' : ''}`
      select.append(opt)
    }
    if ([...select.options].some(o => o.value === was)) select.value = was
  }

  function refreshLists() {
    refreshCharacters()
    const pick = chosen()
    for (const select of [askPage, agentPage].map(p => p.querySelector('select.session'))) {
      const was = select.value
      select.innerHTML = ''
      for (const s of sessions) {
        const opt = document.createElement('option')
        opt.value = s.id
        opt.textContent = `${leadName(s)} · ${s.name || 'a session'}`
        select.append(opt)
      }
      const want = pick ?? was
      if (sessions.some(s => s.id === want)) select.value = want
    }
    const folderSelect = newPage.querySelector('select.folder')
    const was = folderSelect.value
    folderSelect.innerHTML = ''
    for (const f of folders) {
      const opt = document.createElement('option')
      opt.value = f
      opt.textContent = f
      folderSelect.append(opt)
    }
    if (folders.includes(was)) folderSelect.value = was
  }

  function wire(page, send) {
    const go = async () => {
      if (!canSend) return
      const btn = page.querySelector('.send')
      btn.disabled = true
      try {
        note(page, await send(page))
      } catch (err) {
        note(page, `Not sent: ${err.message || err}`)
      } finally {
        btn.disabled = false
      }
    }
    page.querySelector('.send').addEventListener('click', go)
    page.querySelector('textarea, input.path')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.target.tagName === 'INPUT')) {
        e.preventDefault()
        void go()
      }
    })
  }

  const target = page => {
    const id = page.querySelector('select.session').value
    const s = sessions.find(x => x.id === id)
    if (!s) throw new Error('pick a session first')
    return s
  }
  wire(askPage, async page => {
    const s = target(page)
    const area = page.querySelector('textarea')
    const text = area.value.trim()
    if (!text) throw new Error('write a prompt first')
    await ask('/command', { session: s.id, kind: 'prompt', text })
    area.value = ''
    return `Sent to ${leadName(s)} · ${s.name}. It runs as soon as that session is free.`
  })
  wire(agentPage, async page => {
    const s = target(page)
    const area = page.querySelector('textarea')
    const text = area.value.trim()
    if (!text) throw new Error('write the task first')
    const agentType = page.querySelector('select.kind').value
    const character = page.querySelector('select.character').value
    // the server keeps the pick and puts it on the agent when the session lists it, whatever mod that session runs
    await ask('/command', { session: s.id, kind: 'agent', text, agentType, ...(character ? { character } : {}) })
    area.value = ''
    const who = character ? page.querySelector('select.character').selectedOptions[0]?.textContent.split(' (')[0].split(' · ')[0] : ''
    return `${leadName(s)} is calling in a ${agentType} agent${who ? `: ${who} is on the way` : ''}. Watch the door.`
  })
  wire(newPage, async page => {
    const typed = page.querySelector('input.path').value.trim()
    const folder = typed || page.querySelector('select.folder').value
    if (!folder) throw new Error('pick or type a folder')
    const remote = page.querySelector('input.remote').checked
    await ask('/new-session', { folder, remote })
    page.querySelector('input.path').value = ''
    return remote
      ? `A new terminal is opening in ${folder} with Remote Control on: find it in the Claude app on your phone or tablet.`
      : `A new terminal is opening in ${folder}. Its Claude walks in once it starts.`
  })

  return {
    apply(snapshot, list) {
      sessions = list || []
      if (Array.isArray(snapshot?.characters?.list || snapshot?.characters))
        listed = new Map((snapshot.characters.list || snapshot.characters).filter(c => c && c.file).map(c => [c.file, c]))
      const known = new Set()
      folders = []
      for (const f of [...sessions.map(s => s.cwd), ...(snapshot?.stats?.folders || [])])
        if (typeof f === 'string' && f && !known.has(f)) {
          known.add(f)
          folders.push(f)
        }
      if (!isBusy()) refreshLists()
    },
  }
}
