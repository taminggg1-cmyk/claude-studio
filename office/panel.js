// The office's panel: the "+ Ask the office" button at the top right and the card it opens, with one tab per thing
// you can do from the window. Features add their own tabs with addTab(); the panel builds itself on the first one.
//
// The page key: the window may ask things of the office server (send a prompt, save the room's design, upload a
// character) only with the page key, which the session that opened the window put in its address after a # (the
// browser never sends that part to the server). The page keeps the key for this tab and takes it out of the address
// bar. ask() sends a request with it; canSend says whether this window has one.

const KEY_STORE = 'studio-page-key'

function takeKey() {
  const m = /(?:^|[#&])key=([0-9a-f]{16,128})/.exec(location.hash)
  let key = m ? m[1] : ''
  try {
    if (key) sessionStorage.setItem(KEY_STORE, key)
    else key = sessionStorage.getItem(KEY_STORE) || ''
  } catch {
    // no storage: the key lasts until the page reloads
  }
  if (m) history.replaceState(null, '', location.pathname + location.search)
  return key
}

const KEY = takeKey()
const DEMO = new URLSearchParams(location.search).has('demo') || /[?&](sessions|still|lineup)\b/.test(location.search)

/** Whether this window may ask things of the office (it has the page key and is not a demo page). */
export const canSend = !!KEY && !DEMO

/** Why this window cannot send, in words for a note, or '' when it can. */
export const cannotSendWhy = canSend ? '' : DEMO ? 'A demo page: nothing is sent.' : 'Type /office in Claude Code to reopen this window with sending turned on.'

/**
 * Sends a request to the office server with the page key. `body` is JSON (an object) or raw bytes (a Blob, File or
 * ArrayBuffer, sent as is with `type`). Resolves the response's text (JSON parsed when it is JSON); throws an Error with
 * the server's words when it says no.
 */
export async function ask(path, body, { method = 'POST', type } = {}) {
  if (!canSend) throw new Error(cannotSendWhy)
  const raw = body instanceof Blob || body instanceof ArrayBuffer
  const res = await fetch(path, {
    method,
    headers: { 'content-type': raw ? type || 'application/octet-stream' : 'application/json', 'x-page-key': KEY },
    body: method === 'GET' ? undefined : raw ? body : JSON.stringify(body ?? {}),
  })
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(text || `the office answered ${res.status}`)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const CSS = `
#ctl-button {
  position: fixed; right: 14px; top: 14px; z-index: 30;
  height: 34px; padding: 0 14px 0 12px; border: 1px solid var(--card-line); border-radius: 999px;
  background: var(--card); color: var(--ink); box-shadow: var(--shadow);
  font-family: inherit; font-size: 12.5px; font-weight: 600; line-height: 1; cursor: pointer; display: flex; align-items: center; gap: 7px;
  backdrop-filter: blur(6px);
}
#ctl-button:hover { filter: brightness(1.04); }
#ctl-button b { font-size: 16px; font-weight: 600; color: #c8775a; margin-top: -1px; }
#ctl-panel {
  position: fixed; right: 14px; top: 58px; z-index: 30; width: min(360px, calc(100vw - 28px));
  max-height: calc(100vh - 80px); overflow: auto;
  border: 1px solid var(--card-line); border-radius: 16px; background: var(--card); color: var(--ink);
  box-shadow: var(--shadow); backdrop-filter: blur(8px); padding: 12px 12px 10px; font-size: 12.5px;
  display: none;
}
#ctl-panel.show { display: block; }
#ctl-panel .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
#ctl-panel .tabs button {
  flex: 1 0 auto; border: 0; border-radius: 999px; padding: 6px 9px; background: transparent; color: var(--muted);
  font: inherit; font-weight: 600; cursor: pointer;
}
#ctl-panel .tabs button.on { background: color-mix(in srgb, #c8775a 16%, transparent); color: var(--ink); }
#ctl-panel label { display: block; color: var(--muted); font-size: 11.5px; margin: 6px 2px 3px; }
#ctl-panel select, #ctl-panel textarea, #ctl-panel input:not([type=checkbox]):not([type=color]):not([type=range]) {
  width: 100%; box-sizing: border-box; border: 1px solid var(--card-line); border-radius: 10px;
  background: color-mix(in srgb, var(--card) 70%, white 30%); color: var(--ink); font: inherit; padding: 7px 9px;
}
#ctl-panel textarea { resize: vertical; min-height: 64px; max-height: 220px; }
#ctl-panel .row { display: flex; gap: 8px; align-items: center; margin-top: 9px; }
#ctl-panel .row .note, #ctl-panel .note { flex: 1; color: var(--muted); font-size: 11.5px; line-height: 1.35; }
#ctl-panel .send, #ctl-panel .btn {
  border: 0; border-radius: 999px; padding: 7px 14px; font: inherit; font-weight: 700; cursor: pointer;
  color: #fffaf4; background: linear-gradient(180deg, #d98a67, #c06c4c);
}
#ctl-panel .btn.plain { color: var(--ink); background: color-mix(in srgb, #c8775a 14%, transparent); }
#ctl-panel .send:disabled, #ctl-panel .btn:disabled { opacity: 0.45; cursor: default; }
#ctl-panel .page { display: none; }
#ctl-panel .page.on { display: block; }
`

let button = null
let panel = null
let tabRow = null
const tabs = []
const openers = []

function build() {
  if (panel) return
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  button = document.createElement('button')
  button.id = 'ctl-button'
  button.type = 'button'
  button.title = 'Ask Claude, add an agent, start a session, change the room'
  button.innerHTML = '<b>+</b><span>Ask the office</span>'
  panel = document.createElement('div')
  panel.id = 'ctl-panel'
  tabRow = document.createElement('div')
  tabRow.className = 'tabs'
  panel.append(tabRow)
  document.body.append(button, panel)
  // keep the room's own drag, click and scroll handlers away from the panel
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel', 'contextmenu', 'keydown'])
    for (const el of [panel, button]) el.addEventListener(type, e => e.stopPropagation())
  button.addEventListener('click', () => {
    panel.classList.toggle('show')
    if (panel.classList.contains('show')) {
      for (const fn of openers) fn()
      panel.querySelector('.page.on textarea, .page.on input')?.focus()
    }
  })
}

/** Shows one tab of the panel (by its id), opening the panel. */
export function showTab(id) {
  build()
  for (const t of tabs) {
    t.button.classList.toggle('on', t.id === id)
    t.page.classList.toggle('on', t.id === id)
  }
  panel.classList.add('show')
  for (const fn of openers) fn()
}

/**
 * Adds a tab to the panel and returns its page element (a div) to fill. `onOpen` runs each time the panel opens (to
 * refresh lists). Tabs show in the order they are added; the first is shown first.
 */
export function addTab(id, title, onOpen) {
  build()
  const tabButton = document.createElement('button')
  tabButton.type = 'button'
  tabButton.textContent = title
  const page = document.createElement('div')
  page.className = 'page'
  page.dataset.page = id
  tabRow.append(tabButton)
  panel.append(page)
  tabs.push({ id, button: tabButton, page })
  if (tabs.length === 1) {
    tabButton.classList.add('on')
    page.classList.add('on')
  }
  tabButton.addEventListener('click', () => showTab(id))
  if (onOpen) openers.push(onOpen)
  return page
}

/** Whether the panel is open and the focus is inside it (a list should not be rebuilt under the person's hands). */
export const isBusy = () => !!panel?.classList.contains('show') && panel.contains(document.activeElement)
/** Whether the panel is open. */
export const isOpen = () => !!panel?.classList.contains('show')
