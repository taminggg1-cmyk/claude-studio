// The weather feature: the room's weather follows today's real forecast for the person's city. The person types a city
// in the "Weather" tab of the panel; the server (../server-features/weather.mjs) looks it up, fetches the forecast
// from Open-Meteo and sends the latest reading with every update as snapshot.weather.
//
// The page turns the reading (a WMO weather code, cloud cover, rain and wind) into calm effects that stay outside the
// room: clouds dim the light and grey the sky in the windows, rain and drizzle fall outside the glass with drops
// running down it, snow falls and builds up a little on the sills, a thunderstorm adds lightning every 8 to 20
// seconds, fog hangs as a soft haze, wind pushes the rain and snow sideways, and a clear day makes the sunbeams
// stronger. A short line under the title card says the weather in words.
//
// Demo switch: ?weather=clear|partly|cloudy|rain|heavy|drizzle|storm|snow|fog fakes a reading for Bangkok.

import { addTab, ask, canSend, cannotSendWhy, showTab } from '../panel.js'

/** The words and the small symbol of each kind of weather. */
const KINDS = {
  clear: { words: 'Clear', icon: '☀' },
  partly: { words: 'Partly cloudy', icon: '⛅' },
  cloudy: { words: 'Cloudy', icon: '☁' },
  fog: { words: 'Fog', icon: '≋' },
  drizzle: { words: 'Drizzle', icon: '☂' },
  rain: { words: 'Rain', icon: '☂' },
  heavy: { words: 'Heavy rain', icon: '☂' },
  snow: { words: 'Snow', icon: '❄' },
  storm: { words: 'Thunderstorm', icon: '⚡' },
}

/** A WMO weather code (and the cloud cover in percent) as one of the kinds above. */
export function kindOf(code, cloud = 0) {
  if (code === 0 || code === 1) return cloud > 55 ? 'partly' : 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code === 65 || code === 67 || code === 82) return 'heavy'
  if ((code >= 61 && code <= 66) || code === 80 || code === 81) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95 && code <= 99) return 'storm'
  return cloud > 70 ? 'cloudy' : cloud > 30 ? 'partly' : 'clear'
}

/** How each kind changes the scene: cloudiness (0 to 1), rain amount (0 to 1), snow, fog and storm. */
const LOOK = {
  clear: { cloud: 0.05 },
  partly: { cloud: 0.4 },
  cloudy: { cloud: 0.8 },
  fog: { cloud: 0.8, fog: 0.75 },
  drizzle: { cloud: 0.75, rain: 0.2 },
  rain: { cloud: 0.88, rain: 0.55 },
  heavy: { cloud: 0.96, rain: 1 },
  snow: { cloud: 0.8, snow: 1 },
  storm: { cloud: 1, rain: 0.85, storm: 1 },
}

/** What ?weather=<kind> pretends: [WMO code, cloud cover, wind km/h]. */
const DEMO = {
  clear: [0, 5, 6],
  partly: [2, 45, 10],
  cloudy: [3, 90, 8],
  fog: [45, 100, 3],
  drizzle: [51, 85, 9],
  rain: [63, 92, 14],
  heavy: [65, 98, 22],
  storm: [95, 100, 28],
  snow: [73, 90, 7],
}

const CSS = `
#weather-hud {
  position: fixed; left: 18px; top: 96px; z-index: 5; padding: 5px 12px 5px 10px; border-radius: 999px;
  background: var(--card); border: 1px solid var(--card-line); box-shadow: var(--shadow); color: var(--muted);
  font-size: 12px; line-height: 1.2; white-space: nowrap; cursor: pointer; display: none; backdrop-filter: blur(6px);
}
#weather-hud.show { display: block; }
#weather-hud b { color: var(--ink); font-weight: 600; margin-right: 2px; }
.weather-now { display: flex; align-items: center; gap: 12px; margin: 4px 2px 10px; }
.weather-now .big { font-size: 34px; line-height: 1; width: 44px; text-align: center; }
.weather-now .words b { display: block; font-size: 14px; }
.weather-now .words span { color: var(--muted); font-size: 11.5px; line-height: 1.5; }
`

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const rnd = (() => {
  let s = 20260
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
})()

/** A small canvas texture. */
function canvasTexture(THREE, w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function makeWeather(ctx) {
  const { THREE, scene, world, env, params } = ctx
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.append(style)

  const demoKind = params.has('weather') ? (DEMO[params.get('weather')] ? params.get('weather') : 'clear') : ''

  /** The reading the server sent (or the fake one): { city, country, current, today, updated }, or null. */
  let data = null

  // ------------------------------------------------------------------------------------------ the panel tab
  const page = addTab('weather', 'Weather', () => fill(false))
  page.innerHTML = `
    <div class="weather-now"><div class="big"></div><div class="words"><b></b><span></span></div></div>
    <label>Your city</label>
    <input type="text" maxlength="80" placeholder="for example Bangkok" />
    <div class="row"><button class="btn save" type="button">Save</button><button class="btn plain off" type="button">Turn off</button></div>
    <div class="note"></div>`
  const big = page.querySelector('.big')
  const nowWords = page.querySelector('.words b')
  const nowMore = page.querySelector('.words span')
  const input = page.querySelector('input')
  const saveBtn = page.querySelector('.save')
  const offBtn = page.querySelector('.off')
  const note = page.querySelector('.note')
  const setNote = text => (note.textContent = text)

  /** Words for the current reading. */
  function describe(d) {
    if (!d?.city) return { icon: KINDS.cloudy.icon, title: 'No city yet', more: 'Type your city and the room will follow its weather.' }
    if (!d.current) return { icon: KINDS.cloudy.icon, title: d.city, more: 'Waiting for the forecast.' }
    const c = d.current
    const kind = kindOf(c.code, c.cloud)
    const parts = [c.temp === null ? '' : `${Math.round(c.temp)}° now`, `cloud ${Math.round(c.cloud)}%`, `wind ${Math.round(c.wind)} km/h`]
    if (c.precip > 0) parts.push(`rain ${c.precip} mm`)
    if (d.today?.max != null) parts.push(`today ${Math.round(d.today.min)}° to ${Math.round(d.today.max)}°`)
    return { icon: KINDS[kind].icon, title: `${KINDS[kind].words} in ${d.city}${d.country ? ', ' + d.country : ''}`, more: parts.filter(Boolean).join(' · ') }
  }

  function fill(keepInput = true) {
    const d = describe(data)
    big.textContent = d.icon
    nowWords.textContent = d.title
    nowMore.textContent = d.more
    if (!(keepInput && document.activeElement === input) && data?.city && !input.value) input.value = data.city
    saveBtn.disabled = !canSend
    offBtn.disabled = !canSend || !data?.city
    if (!canSend && !note.textContent) setNote(cannotSendWhy)
  }

  saveBtn.addEventListener('click', async () => {
    const city = input.value.trim()
    if (!city) return setNote('Type a city first.')
    saveBtn.disabled = true
    setNote('Looking it up...')
    try {
      data = await ask('/weather/city', { city })
      input.value = data.city || city
      setNote(data.current ? 'Saved. The room follows this city now.' : 'Saved. The forecast has not arrived yet.')
    } catch (err) {
      setNote(String(err.message || err))
    }
    fill()
    hudUpdate()
  })
  offBtn.addEventListener('click', async () => {
    try {
      data = await ask('/weather/clear', {})
      input.value = ''
      setNote('Turned off. The room is back to its own sky.')
    } catch (err) {
      setNote(String(err.message || err))
    }
    fill()
    hudUpdate()
  })
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveBtn.click()
  })

  // ------------------------------------------------------------------------------------------ the line near the title
  const hud = document.createElement('div')
  hud.id = 'weather-hud'
  hud.title = 'Open the weather settings'
  hud.addEventListener('click', () => showTab('weather'))
  document.body.append(hud)
  let hudAt = -9
  function hudUpdate() {
    const c = data?.current
    hud.classList.toggle('show', !!data?.city)
    if (!data?.city) return
    const kind = c ? kindOf(c.code, c.cloud) : null
    hud.textContent = ''
    const b = document.createElement('b')
    b.textContent = c ? `${KINDS[kind].icon} ${c.temp === null ? '' : Math.round(c.temp) + '°'}` : KINDS.cloudy.icon
    hud.append(b, ' ' + data.city + (c ? '' : ', waiting for the forecast'))
    const h = document.getElementById('hud')
    if (h) hud.style.top = Math.round(h.getBoundingClientRect().bottom + 6) + 'px'
  }

  // ------------------------------------------------------------------------------------------ the scene
  const W = world.windows
  const built = W ? build() : null

  function build() {
    const xa = W.list[0][0]
    const xb = W.list[W.list.length - 1][1]
    const zOut = W.z - 0.35 // just outside the wall
    const MAX_RAIN = 700
    const MAX_SNOW = 260
    const MAX_DROPS = 60

    const streak = canvasTexture(THREE, 16, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(255,255,255,0)')
      grad.addColorStop(1, 'rgba(255,255,255,1)')
      g.fillStyle = grad
      g.fillRect(w / 2 - 1, 0, 2, h)
    })
    const dot = canvasTexture(THREE, 32, 32, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(0.5, 'rgba(255,255,255,0.7)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    })
    const haze = canvasTexture(THREE, 8, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(255,255,255,0.55)')
      grad.addColorStop(1, 'rgba(255,255,255,1)')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    })

    const points = (map, size, color, count, order) => {
      const pos = new Float32Array(count * 3)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({ map, size, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, color })
      const pts = new THREE.Points(geo, mat)
      pts.frustumCulled = false
      pts.renderOrder = order
      pts.visible = false
      scene.add(pts)
      return { pts, pos, geo, mat, count }
    }

    // rain streaks and snowflakes outside the windows
    const rain = points(streak, 22, 0xcfdcea, MAX_RAIN, 1)
    const snow = points(dot, 7, 0xffffff, MAX_SNOW, 1)
    const seedsRain = Array.from({ length: MAX_RAIN }, () => ({ x: xa - 0.3 + rnd() * (xb - xa + 0.6), y: 0.2 + rnd() * 3.4, z: zOut - rnd() * 0.5, f: 0.75 + rnd() * 0.5 }))
    const seedsSnow = Array.from({ length: MAX_SNOW }, () => ({ x: xa - 0.3 + rnd() * (xb - xa + 0.6), y: 0.2 + rnd() * 3.4, z: zOut - rnd() * 0.5, f: 0.6 + rnd() * 0.8, k: rnd() * 10 }))
    // drops that run down the glass
    const drops = points(dot, 6, 0xd9ecff, MAX_DROPS, 3)
    const seedsDrops = Array.from({ length: MAX_DROPS }, (_, i) => {
      const [a, b] = W.list[i % W.list.length]
      return { x: a + 0.08 + rnd() * (b - a - 0.16), y: W.y[0] + rnd() * (W.y[1] - W.y[0]), k: rnd() * 10, v: 0.05 + rnd() * 0.1 }
    })

    // a soft haze for fog, just outside the wall
    const hazeMat = new THREE.MeshBasicMaterial({ map: haze, color: 0xdfe5ea, transparent: true, opacity: 0, depthWrite: false })
    const hazeMesh = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa + 0.2, 4.4), hazeMat)
    hazeMesh.position.set((xa + xb) / 2, 1.5, zOut - 0.05)
    hazeMesh.renderOrder = 1
    hazeMesh.visible = false
    scene.add(hazeMesh)

    // snow building up on each sill
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf6f9fc, roughness: 0.95 })
    const caps = W.list.map(([a, b]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b - a + 0.2, 0.06, 0.16), snowMat)
      m.position.set((a + b) / 2, W.y[0] + 0.03, W.z - 0.02)
      m.visible = false
      scene.add(m)
      return m
    })

    return { rain, snow, drops, seedsRain, seedsSnow, seedsDrops, hazeMat, hazeMesh, caps, xa, xb }
  }

  // eased state: what the scene looks like now
  const now = { cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0, wind: 0, pile: 0, sun: 1, sky: 1, gain: 1, tint: 0 }
  let flash = 0
  let flashes = [] // seconds until the next flickers of the current strike
  let nextStrike = demoKind === 'storm' ? 3 : 4
  let clock = 0
  const tint = new THREE.Color()
  const WHITE = new THREE.Color(1, 1, 1)
  const GREY = new THREE.Color(0.62, 0.67, 0.73)
  const DARK = new THREE.Color(0.34, 0.38, 0.47)

  function goal() {
    if (!data?.city || !data.current) return { cloud: 0, rain: 0, snow: 0, fog: 0, storm: 0, wind: 0 }
    const c = data.current
    const kind = kindOf(c.code, c.cloud)
    const look = LOOK[kind]
    const share = (c.cloud ?? 0) / 100
    let cloud = look.cloud
    if (kind === 'clear') cloud = Math.min(0.35, share * 0.6 + 0.05)
    else if (kind === 'partly') cloud = clamp(share, 0.3, 0.65)
    else cloud = Math.max(cloud, share)
    let rainAmt = look.rain ?? 0
    if (kind === 'rain' && c.precip > 2.5) rainAmt = 0.75
    return { cloud, rain: rainAmt, snow: look.snow ?? 0, fog: look.fog ?? 0, storm: look.storm ?? 0, wind: clamp((c.wind ?? 0) / 40, 0, 1.2) }
  }

  function strike() {
    flash = 1
    flashes = [0.16 + rnd() * 0.1, 0.4 + rnd() * 0.2]
  }

  if (demoKind) {
    const [code, cloud, wind] = DEMO[demoKind]
    data = {
      city: 'Your city',
      country: '',
      current: { code, temp: 27, cloud, precip: code >= 61 && code < 70 ? 3 : 0, wind, isDay: 1 },
      today: { code, max: 31, min: 24 },
      updated: Date.now(),
    }
    // a handle for checking by hand: __weather.strike(), __weather.set('snow')
    window.__weather = {
      strike,
      now,
      set(kind) {
        if (!DEMO[kind]) return
        const [c, cl, w] = DEMO[kind]
        data.current = { code: c, temp: 27, cloud: cl, precip: c >= 61 && c < 70 ? 3 : 0, wind: w, isDay: 1 }
      },
    }
    setTimeout(() => {
      fill()
      hudUpdate()
    }, 0)
  }

  function simulate(dt) {
    const g = goal()
    for (const k of ['cloud', 'rain', 'snow', 'fog', 'storm', 'wind']) now[k] += (g[k] - now[k]) * (1 - Math.exp(-dt * 0.6))
    // the light: never below about 0.45 of the clock's light
    const sunGoal = Math.max(0.45, 1 - 0.62 * now.cloud - 0.08 * now.storm)
    const skyGoal = Math.max(0.55, 1 - 0.4 * now.cloud)
    now.sun += (sunGoal - now.sun) * (1 - Math.exp(-dt * 0.8))
    now.sky += (skyGoal - now.sky) * (1 - Math.exp(-dt * 0.8))
    // the sunbeams: stronger on a clear day, gone under cloud
    const c = now.cloud
    const gainGoal = !data?.current ? 1 : c < 0.3 ? 1 + ((0.3 - c) / 0.3) * 0.35 : 1 - ((c - 0.3) / 0.7) * 0.9
    now.gain += (gainGoal - now.gain) * (1 - Math.exp(-dt * 0.8))
    // lightning
    if (now.storm > 0.5) {
      nextStrike -= dt
      if (nextStrike <= 0) {
        strike()
        nextStrike = 8 + rnd() * 12
      }
    }
    if (flashes.length) {
      flashes = flashes.map(s => s - dt)
      if (flashes[0] <= 0) {
        flashes.shift()
        flash = 0.7
      }
    }
    flash *= Math.exp(-dt * 7)
    if (flash < 0.01) flash = 0
    now.tint = clamp(now.cloud * 0.85 + now.storm * 0.3, 0, 1.15)
  }

  function paint(dt, t) {
    if (!built) return
    const { rain, snow, drops, seedsRain, seedsSnow, seedsDrops, hazeMat, hazeMesh, caps, xa, xb } = built
    const drift = now.wind * 0.7
    const span = xb - xa + 0.6

    // the sky in the windows: grey under cloud, a flash in a storm
    tint.copy(WHITE).lerp(GREY, clamp(now.tint, 0, 1)).lerp(DARK, clamp(now.storm * 0.7, 0, 1))
    tint.multiplyScalar(1 + flash * 1.1)
    W.sky.material.color.copy(tint)
    W.nightSky.material.color.copy(tint)

    // rain
    const r = now.rain
    rain.pts.visible = r > 0.01
    if (rain.pts.visible) {
      rain.mat.opacity = 0.2 + r * 0.4
      rain.mat.size = 14 + r * 16
      rain.geo.setDrawRange(0, Math.floor(rain.count * (0.15 + r * 0.85)))
      const fall = 2.6 + r * 5.5
      for (let i = 0; i < rain.count; i++) {
        const s = seedsRain[i]
        s.y -= fall * s.f * dt
        s.x += drift * dt * s.f
        if (s.y < 0.15) s.y += 3.5
        if (s.x > xb + 0.3) s.x -= span
        rain.pos[i * 3] = s.x
        rain.pos[i * 3 + 1] = s.y
        rain.pos[i * 3 + 2] = s.z
      }
      rain.geo.attributes.position.needsUpdate = true
    }

    // drops running down the glass
    const dr = Math.min(1, r * 1.3)
    drops.pts.visible = dr > 0.01
    if (drops.pts.visible) {
      drops.mat.opacity = 0.25 + dr * 0.4
      drops.geo.setDrawRange(0, Math.floor(drops.count * (0.2 + dr * 0.8)))
      for (let i = 0; i < drops.count; i++) {
        const s = seedsDrops[i]
        // each drop pauses, then slides a little
        const slide = Math.max(0, Math.sin(t * 0.7 + s.k * 3)) ** 2
        s.y -= s.v * slide * (0.5 + dr) * dt
        if (s.y < W.y[0] + 0.04) s.y = W.y[1] - 0.05 - rnd() * 0.3
        drops.pos[i * 3] = s.x
        drops.pos[i * 3 + 1] = s.y
        drops.pos[i * 3 + 2] = W.z - 0.115
      }
      drops.geo.attributes.position.needsUpdate = true
    }

    // snow
    const sn = now.snow
    snow.pts.visible = sn > 0.01
    if (snow.pts.visible) {
      snow.mat.opacity = 0.85 * sn
      snow.geo.setDrawRange(0, Math.floor(snow.count * sn))
      for (let i = 0; i < snow.count; i++) {
        const s = seedsSnow[i]
        s.y -= 0.45 * s.f * dt
        s.x += (drift * 0.6 + Math.sin(t * 0.6 + s.k) * 0.12) * dt
        if (s.y < 0.15) s.y += 3.5
        if (s.x > xb + 0.3) s.x -= span
        else if (s.x < xa - 0.3) s.x += span
        snow.pos[i * 3] = s.x
        snow.pos[i * 3 + 1] = s.y
        snow.pos[i * 3 + 2] = s.z
      }
      snow.geo.attributes.position.needsUpdate = true
    }
    // a little snow on the sills: it grows over a few minutes while it snows and melts away after
    now.pile = sn > 0.5 ? clamp(Math.max(now.pile + dt / 240, 0.35), 0, 1) : clamp(now.pile - dt / 120, 0, 1)
    for (const cap of caps) {
      cap.visible = now.pile > 0.02
      const k = Math.max(0.05, now.pile) * 1.4
      cap.scale.y = k
      cap.position.y = W.y[0] + 0.03 * k + 0.02
    }

    // fog, and the faint haze of a cloudy day
    const hz = Math.max(now.fog * 0.8, now.cloud * 0.12)
    hazeMesh.visible = hz > 0.01
    hazeMat.opacity = hz
  }

  function step(dt) {
    dt = Math.min(dt, 0.1)
    clock += dt
    simulate(dt)
    paint(dt, clock)
    env.sun = now.sun + flash * 1.2
    env.sky = now.sky + flash * 0.5
    world.sunGain = now.gain
    if (clock - hudAt > 2) {
      hudAt = clock
      if (data?.city) hudUpdate()
    }
  }

  return {
    apply(snapshot) {
      if (demoKind) return
      const next = snapshot?.weather?.city ? snapshot.weather : null
      if (JSON.stringify(next) === JSON.stringify(data)) return
      data = next
      fill()
      hudUpdate()
    },
    step,
  }
}
