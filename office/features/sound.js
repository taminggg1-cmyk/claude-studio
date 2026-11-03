// Sound: soft room sounds and a ding when a session waits for you, made with the Web Audio API (no sound files).
// See ../features.js for the hooks a feature may answer.
//
//   - Alerts: a soft single ding when a session finishes and waits ("Your turn"). A session that needs your OK makes
//     no sound (the your-turn feature's red bell shows it). The waits already dinged for are kept in localStorage, so a
//     reload never dings for the same wait twice.
//   - Ambient (quiet): rain (and distant thunder on a storm's flashes), a crackle while a desk burns, a pop or a small
//     cheer when someone celebrates.
//   - The sound bus: any feature can make a sound with
//       window.dispatchEvent(new CustomEvent('studio:sound', { detail: { name } }))
//     Names: ding, buzz, ring, alarm, scribble, page-turn, paper, cheer, pop (thunder too). Unknown names are
//     ignored.
//   - A speaker button at the top right, left of the "+ Ask the office" button, cycles: All sounds, Alerts only, Off.
//     The choice is kept in localStorage. The window is opened with Chromium's autoplay flag so alerts can sound at
//     once; if the browser still keeps the sound locked, the button shows a dot and any click or key unlocks it.
//
// Demo switch: ?sound (best with ?demo) plays every sound in turn, every 3 seconds. Headless pages cannot be heard, so
// window.__studioSound = { log, counts, check(sessions), peak(name), ... } records what was played.

const MODES = ['all', 'alerts', 'off']
const MODE_WORDS = { all: 'All sounds', alerts: 'Alerts only', off: 'Off' }
const MODE_KEY = 'studio-sound-mode'
const SEEN_KEY = 'studio-sound-seen'
const ALERTS = new Set(['ding', 'buzz', 'ring', 'alarm'])
const NAMES = ['ding', 'buzz', 'ring', 'alarm', 'scribble', 'page-turn', 'paper', 'cheer', 'pop']
const MASTER = 0.5 // the whole room is quiet: everything below is scaled by this
const OLD_WAIT_MS = 15000 // a "your turn" wait older than this when the page opens is not news
const DEMO_GAP = 3

const rnd = (a, b) => a + Math.random() * (b - a)

// ------------------------------------------------------------------------------------------------ the synthesis

const noises = new WeakMap()

/** Two seconds of white noise for an audio context, made once. */
function noiseBuffer(ac) {
  let buf = noises.get(ac)
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noises.set(ac, buf)
  }
  return buf
}

/** The end of every sound: a master volume and a soft limiter so nothing ever gets harsh. */
function makeChain(ac, volume = MASTER) {
  const master = ac.createGain()
  master.gain.value = volume
  const limiter = ac.createDynamicsCompressor()
  limiter.threshold.value = -14
  limiter.knee.value = 18
  limiter.ratio.value = 6
  master.connect(limiter)
  limiter.connect(ac.destination)
  return master
}

/** One soft tone: a quick fade in and an exponential fade out. */
function tone(ac, out, t, freq, dur, { type = 'sine', gain = 0.2, attack = 0.01, glideTo } = {}) {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** A bell: a few sine partials that ring out one after the other (the high ones die first). */
function bell(ac, out, t, freq, { gain = 0.2, ring = 1.2 } = {}) {
  for (const [ratio, amp, len] of [[1, 1, 1], [2.01, 0.35, 0.6], [2.76, 0.2, 0.4], [5.4, 0.07, 0.2]]) {
    tone(ac, out, t, freq * ratio, ring * len, { gain: gain * amp, attack: 0.006 })
  }
}

/** A burst of filtered noise: rustle, tick, hiss, rumble. `sweepTo` slides the filter's pitch over the burst. */
function burst(ac, out, t, dur, { type = 'bandpass', freq = 2000, q = 1, gain = 0.1, attack = 0.004, sweepTo } = {}) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const f = ac.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(freq, t)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f)
  f.connect(g)
  g.connect(out)
  src.start(t, Math.random() * 1.5)
  src.stop(t + dur + 0.05)
}

/** The named sounds. Each takes (ac, out, t, opts) and schedules itself from time t. */
const VOICES = {
  // one softer bell note
  ding(ac, out, t) {
    bell(ac, out, t, 1047, { gain: 0.14, ring: 1.3 })
  },
  // a low, rounded double buzz (a "no")
  buzz(ac, out, t) {
    for (const d of [0, 0.2]) {
      const o = ac.createOscillator()
      const f = ac.createBiquadFilter()
      const g = ac.createGain()
      o.type = 'sawtooth'
      o.frequency.value = 110
      f.type = 'lowpass'
      f.frequency.value = 420
      g.gain.setValueAtTime(0.0001, t + d)
      g.gain.exponentialRampToValueAtTime(0.16, t + d + 0.02)
      g.gain.setValueAtTime(0.16, t + d + 0.11)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16)
      o.connect(f)
      f.connect(g)
      g.connect(out)
      o.start(t + d)
      o.stop(t + d + 0.2)
    }
  },
  // an old telephone: two bursts of a quick two-tone trill
  ring(ac, out, t) {
    for (const d of [0, 0.7]) {
      for (let i = 0; i < 8; i++) tone(ac, out, t + d + i * 0.05, i % 2 ? 1180 : 880, 0.05, { gain: 0.2, attack: 0.005 })
    }
  },
  // beep, beep, beep (twice)
  alarm(ac, out, t) {
    for (const d of [0, 0.9]) {
      for (let i = 0; i < 3; i++) tone(ac, out, t + d + i * 0.22, 1000, 0.14, { type: 'triangle', gain: 0.13, attack: 0.01 })
    }
  },
  // a pencil on paper: four quick strokes
  scribble(ac, out, t) {
    for (let i = 0; i < 4; i++) {
      burst(ac, out, t + i * 0.09, 0.07, { freq: rnd(3000, 4200), q: 1.4, gain: 0.2, attack: 0.012 })
    }
  },
  // a page flipping: a quick airy sweep
  'page-turn'(ac, out, t) {
    burst(ac, out, t, 0.32, { freq: 900, sweepTo: 3600, q: 0.8, gain: 0.3, attack: 0.07 })
  },
  // paper being moved: a handful of tiny crackles
  paper(ac, out, t) {
    for (let i = 0; i < 7; i++) burst(ac, out, t + i * rnd(0.03, 0.06), 0.03, { type: 'highpass', freq: rnd(2200, 3500), gain: rnd(0.05, 0.1), attack: 0.002 })
  },
  // a small cheer: a swell of voices and three bright notes
  cheer(ac, out, t) {
    burst(ac, out, t, 1.1, { freq: 1300, q: 0.7, gain: 0.07, attack: 0.18 })
    ;[523, 659, 784].forEach((f, i) => tone(ac, out, t + i * 0.09, f, 0.3, { gain: 0.1, attack: 0.008 }))
  },
  // a bubble pop
  pop(ac, out, t) {
    tone(ac, out, t, 720, 0.09, { gain: 0.2, attack: 0.004, glideTo: 220 })
    burst(ac, out, t, 0.02, { type: 'highpass', freq: 2500, gain: 0.04, attack: 0.002 })
  },
  // far away thunder: a long low rumble that rolls in and out
  thunder(ac, out, t) {
    burst(ac, out, t, 3.2, { type: 'lowpass', freq: 260, sweepTo: 70, q: 0.7, gain: 0.9, attack: 0.5 })
    burst(ac, out, t + 0.9, 2.4, { type: 'lowpass', freq: 180, sweepTo: 60, q: 0.7, gain: 0.5, attack: 0.4 })
  },
  // one crackle of a fire
  crackle(ac, out, t, { gain = 0.1 } = {}) {
    burst(ac, out, t, rnd(0.004, 0.02), { type: 'highpass', freq: rnd(1800, 3800), gain, attack: 0.001 })
  },
}

// ------------------------------------------------------------------------------------------------ the button

const CSS = `
#snd-button {
  position: fixed; right: 150px; top: 14px; z-index: 30; width: 34px; height: 34px; padding: 0;
  border: 1px solid var(--card-line); border-radius: 999px; background: var(--card); color: var(--ink);
  box-shadow: var(--shadow); cursor: pointer; display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(6px);
}
#snd-button:hover { filter: brightness(1.04); }
#snd-button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
#snd-button svg .body { fill: currentColor; fill-opacity: 0.18; }
#snd-button svg .cross { stroke: #c8775a; }
#snd-button.locked::after {
  content: ''; position: absolute; top: 4px; right: 4px; width: 7px; height: 7px; border-radius: 50%;
  background: #c8775a; animation: snd-pulse 1.4s ease-in-out infinite;
}
@keyframes snd-pulse { 50% { opacity: 0.35; } }
`

const SPEAKER = '<path class="body" d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/>'
const ICONS = {
  all: `${SPEAKER}<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/><path d="M18 6.8a7.5 7.5 0 0 1 0 10.4"/>`,
  alerts: `${SPEAKER}<path d="M15.5 9.2a4 4 0 0 1 0 5.6"/>`,
  off: `${SPEAKER}<path class="cross" d="M16 9.5l5 5M21 9.5l-5 5"/>`,
}

export function makeSound(ctx) {
  const { people, chaos, params } = ctx
  const demo = params.has('sound')
  const persist = !demo && !ctx.isDemo

  const store = {
    get(key) {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value)
      } catch {
        // no storage: the choice lasts until the page reloads
      }
    },
  }

  let mode = 'all'
  const saved = persist ? store.get(MODE_KEY) : null
  if (MODES.includes(saved)) mode = saved

  // a record of what was played, for checking by eye or from a test
  const debug = (window.__studioSound = { log: [], counts: {}, mode })
  const note = (name, heard) => {
    debug.counts[name] = (debug.counts[name] || 0) + 1
    if (debug.log.length < 300) debug.log.push({ name, heard, mode, at: Date.now() })
  }

  // ---------------------------------------------------------------------------------------- the audio context
  let ac = null
  let out = null
  let broken = false

  function audio() {
    if (ac || broken || mode === 'off') return ac
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext
      ac = new Ctor()
      out = makeChain(ac)
      ac.onstatechange = refresh
    } catch {
      broken = true
      ac = null
    }
    return ac
  }

  const running = () => !!ac && ac.state === 'running'

  /** Wakes the audio up (a browser may keep it locked until the person has clicked or typed once). */
  function wake() {
    const a = audio()
    if (a && a.state !== 'running') a.resume?.().then(refresh, () => {})
  }
  for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, wake, { capture: true, passive: true })

  /** Plays a named sound now. Returns whether it was heard. */
  function play(name, opts) {
    if (!VOICES[name] || name === 'crackle') return false
    const allowed = mode === 'all' || (mode === 'alerts' && ALERTS.has(name))
    const a = allowed ? audio() : null
    const heard = !!a && a.state === 'running'
    if (a && a.state !== 'running') a.resume?.().then(refresh, () => {})
    if (heard) {
      try {
        VOICES[name](a, out, a.currentTime + 0.02, opts)
      } catch (err) {
        console.warn('studio: sound failed:', name, err)
        return false
      }
    }
    note(name, heard)
    return heard
  }

  /** Plays one tiny ambient sound (a crackle) when the room is on "All sounds". */
  function small(name, opts) {
    if (mode !== 'all' || !running()) return
    VOICES[name](ac, out, ac.currentTime + 0.01, opts)
    debug.counts[name] = (debug.counts[name] || 0) + 1
  }

  window.addEventListener('studio:sound', e => {
    try {
      play(String(e.detail?.name ?? ''))
    } catch {
      // a bad event is not worth a sound
    }
  })
  window.addEventListener('studio:lightning', () => {
    if (mode !== 'all' || !running()) return
    const t = ac.currentTime + rnd(0.6, 2)
    VOICES.thunder(ac, out, t)
    note('thunder', true)
  })

  // ---------------------------------------------------------------------------------------- the speaker button
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)
  const button = document.createElement('button')
  button.id = 'snd-button'
  button.type = 'button'
  document.body.append(button)
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel', 'contextmenu', 'keydown']) button.addEventListener(type, e => e.stopPropagation())

  function refresh() {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    const locked = mode !== 'off' && !!ac && ac.state !== 'running'
    debug.mode = mode
    debug.state = ac ? ac.state : broken ? 'unavailable' : 'none'
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[mode]}</svg>`
    button.classList.toggle('locked', locked)
    button.setAttribute('aria-label', `Sound: ${MODE_WORDS[mode]}`)
    button.title = `Sound: ${MODE_WORDS[mode]}. Click for ${MODE_WORDS[next]}.` + (locked ? ' The browser keeps the sound locked: click anywhere once to turn it on.' : '')
  }

  /** Puts the button just left of the "+ Ask the office" button (or in the corner when that is not there). */
  function place() {
    const ask = document.getElementById('ctl-button')
    const r = ask?.getBoundingClientRect()
    const right = r && r.width ? Math.round(window.innerWidth - r.left + 8) : 14
    button.style.right = `${right}px`
  }

  button.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
    if (persist) store.set(MODE_KEY, mode)
    if (mode === 'off') stopRain()
    else wake()
    refresh()
    // a little note so the new setting can be heard
    if (mode !== 'off') setTimeout(() => play('ding'), 60)
  })
  window.addEventListener('resize', place)
  refresh()
  place()
  setTimeout(place, 500)
  if (mode !== 'off') audio()

  // ---------------------------------------------------------------------------------------- alerts
  const book = (() => {
    if (!persist) return {}
    try {
      return JSON.parse(store.get(SEEN_KEY)) || {}
    } catch {
      return {}
    }
  })()
  let firstLook = true
  let lastSessions = []

  function saveBook(now) {
    for (const key of Object.keys(book)) if (now - book[key].last > 86400000) delete book[key]
    if (persist) store.set(SEEN_KEY, JSON.stringify(book))
  }

  /**
   * Looks at what every session waits for. A "your turn" wait is told apart by its session and start time, and dings
   * once. A session that needs your OK makes no sound.
   */
  function check(sessions, now = Date.now()) {
    for (const s of sessions) {
      const x = s.state?.extras?.['your-turn']
      if (x?.waiting !== 'you') continue
      const key = `${s.id ?? ''}:${x.waiting}:${x.since}`
      if (book[key]) continue
      book[key] = { last: now }
      if (!(firstLook && now - x.since > OLD_WAIT_MS)) play('ding')
    }
    firstLook = false
    saveBook(now)
  }
  debug.check = check

  // ---------------------------------------------------------------------------------------- rain
  let rain = null // { src, gain } while the rain bed is playing
  let rainLevel = 0
  let hidden = document.hidden
  document.addEventListener('visibilitychange', () => (hidden = document.hidden))

  function startRain() {
    const src = ac.createBufferSource()
    src.buffer = noiseBuffer(ac)
    src.loop = true
    const hp = ac.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 700
    const lp = ac.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 6500
    const gain = ac.createGain()
    gain.gain.value = 0
    src.connect(hp)
    hp.connect(lp)
    lp.connect(gain)
    gain.connect(out)
    src.start()
    rain = { src, gain }
  }

  function stopRain() {
    if (!rain) return
    try {
      rain.src.stop()
      rain.gain.disconnect()
    } catch {
      // already stopped
    }
    rain = null
    rainLevel = 0
  }

  /** Eases the rain's volume towards what the weather says (0 to 1). */
  function followRain(target) {
    if (target < 0.01 && !rain) return
    if (!rain) startRain()
    rainLevel += (target - rainLevel) * 0.2
    rain.gain.gain.setTargetAtTime(0.07 * Math.pow(rainLevel, 0.8), ac.currentTime, 0.4)
    if (target < 0.01 && rainLevel < 0.01) stopRain()
    debug.rain = +rainLevel.toFixed(2)
  }

  // ---------------------------------------------------------------------------------------- ambient, every step
  let fireWait = 0
  let ambientClock = 0
  let demoClock = DEMO_GAP - 1.5
  let demoIndex = 0
  let checkClock = 0
  let placeClock = 0
  const cheering = new Set()
  let cheerAt = -9

  function crackling(dt) {
    let heat = 0
    for (const f of chaos.state()) heat += f.heat
    debug.fire = +heat.toFixed(2)
    if (heat < 0.05) return
    fireWait -= dt
    if (fireWait > 0) return
    heat = Math.min(heat, 1.5)
    small('crackle', { gain: 0.06 + 0.08 * heat * Math.random() })
    fireWait = rnd(0.02, 0.13) / (0.3 + heat)
  }

  function cheers(dt) {
    cheerAt += dt
    for (const [id, e] of people) {
      const on = !e.friend && e.p.cheer > 0
      if (on && !cheering.has(id)) {
        cheering.add(id)
        if (cheerAt > 0.6) {
          cheerAt = 0
          play(e.isLead ? 'cheer' : 'pop')
        }
      } else if (!on) cheering.delete(id)
    }
    for (const id of cheering) if (!people.has(id)) cheering.delete(id)
  }

  function runDemo(dt) {
    demoClock += dt
    if (demoClock < DEMO_GAP) return
    demoClock = 0
    const name = demoIndex < NAMES.length ? NAMES[demoIndex] : 'thunder'
    demoIndex = (demoIndex + 1) % (NAMES.length + 1)
    window.dispatchEvent(new CustomEvent('studio:sound', { detail: { name } }))
  }

  function step(dt) {
    dt = Math.min(dt, 0.1)
    ambientClock += dt
    placeClock += dt
    checkClock += dt
    if (demo) runDemo(dt)
    if (placeClock > 2) {
      placeClock = 0
      place()
      refresh()
    }
    if (checkClock > 5) {
      checkClock = 0
      check(lastSessions)
    }
    if (mode === 'all' && running()) {
      crackling(dt)
      cheers(dt)
      followRain(hidden ? 0 : window.__studioWeather?.rain ?? 0)
    } else if (rain) followRain(0)
  }

  /** For checking: the loudest point of a sound, rendered offline (nothing is played). */
  debug.peak = async name => {
    if (!VOICES[name] || typeof OfflineAudioContext === 'undefined') return null
    const off = new OfflineAudioContext(1, 44100 * 5, 44100)
    VOICES[name](off, makeChain(off), 0.05, {})
    const data = (await off.startRendering()).getChannelData(0)
    let peak = 0
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
    return +peak.toFixed(3)
  }
  debug.play = play

  return {
    apply(snapshot, sessions) {
      lastSessions = sessions || []
      check(lastSessions)
    },
    step,
  }
}
