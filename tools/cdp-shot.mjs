// Developer tool for checking the studio page without disturbing the desktop: drives a headless Edge over the
// DevTools protocol on the real GPU, in real time (Edge's own --screenshot/--virtual-time-budget renders only a
// handful of frames). Start a test server first, as the README shows (CLAUDE_STUDIO_LOCK=/tmp/test-office.json
// OFFICE_PORT=47811 node office/server.mjs); demo pages such as ?demo or ?lineup need nothing else. Example steps file:
//   [{ "wait": 15000, "eval": "JSON.stringify(__studio.rows())", "shot": "C:/tmp/a.png" }]

// Drives a headless Edge over the DevTools protocol: opens a page, then runs a script of steps.
// usage: node tools/cdp-shot.mjs <profile> <url> <steps.json> [width] [height]
// steps: [{ "wait": ms } | { "eval": "js" } | { "shot": "path.png" }]
// The Edge profile goes in the system temp folder, or in $CDP_PROFILE_DIR if that is set.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [profile, url, stepsFile, w = '1280', h = '800'] = process.argv.slice(2)
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'))
const port = 9300 + Math.floor(Math.random() * 500)
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${join(process.env.CDP_PROFILE_DIR || tmpdir(), `edge_cdp_${profile}`)}`,
  '--no-first-run',
  '--disable-extensions',
  '--use-angle=d3d11',
  '--ignore-gpu-blocklist',
  `--window-size=${w},${h}`,
  'about:blank',
])
const sleep = ms => new Promise(r => setTimeout(r, ms))
let list
for (let i = 0; i < 60; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    if (list.some(t => t.type === 'page')) break
  } catch {}
  await sleep(250)
}
const target = list.find(t => t.type === 'page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ')
    if (/STUDIO|studio|rror/.test(text)) console.log(`[console] ${text.slice(0, 600)}`)
  } else if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', JSON.stringify(m.params.exceptionDetails).slice(0, 800))
})
const send = (method, params = {}) =>
  new Promise(r => {
    const n = ++id
    pending.set(n, r)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })
for (const s of steps) {
  if (s.wait) await sleep(s.wait)
  if (s.eval) {
    const r = await send('Runtime.evaluate', { expression: s.eval, returnByValue: true, awaitPromise: true })
    console.log('[eval]', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? null).slice(0, 1500))
  }
  if (s.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(s.shot, Buffer.from(r.result.data, 'base64'))
    console.log('[shot]', s.shot)
  }
}
await send('Browser.close').catch(() => {})
edge.kill()
process.exit(0)
