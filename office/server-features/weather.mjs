// The server side of the weather feature (see the 'server features' section of ../server.mjs for the api).
//
// The person types their city in the window. The server looks it up once with Open-Meteo's free geocoding service,
// keeps its name and position in a small file, and asks Open-Meteo for the forecast now and every half hour. Only the
// city's position goes to Open-Meteo. The window gets the latest reading with every update and shows it as weather
// outside the windows. Any failure keeps the last reading.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const EVERY = 30 * 60_000

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round = v => (v === null ? null : Math.round(v * 10) / 10)

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`)
  return res.json()
}

export default function setup(api) {
  const FILE = process.env.CLAUDE_STUDIO_WEATHER || join(api.HOME, 'studio-weather.json')
  /** @type {{ city: string, country: string, latitude: number, longitude: number, timezone: string } | null} */
  let place = null
  /** @type {{ current: object, today: object, updated: number } | null} */
  let reading = null
  let timer = null

  async function save() {
    await mkdir(dirname(FILE), { recursive: true })
    await writeFile(FILE, JSON.stringify(place), 'utf8')
  }

  /** Asks for the forecast of the saved place; true when a new reading was kept. */
  async function refresh() {
    const at = place
    if (!at) return false
    try {
      const q = new URLSearchParams({
        latitude: String(at.latitude),
        longitude: String(at.longitude),
        current: 'temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        forecast_days: '1',
      })
      const data = await getJson(`${FORECAST}?${q}`)
      if (place !== at) return false // the city changed while we waited
      const c = data.current ?? {}
      const d = data.daily ?? {}
      if (num(c.weather_code) === null) throw new Error('no current weather in the answer')
      reading = {
        current: {
          code: c.weather_code,
          temp: round(num(c.temperature_2m)),
          cloud: num(c.cloud_cover) ?? 0,
          precip: num(c.precipitation) ?? 0,
          wind: round(num(c.wind_speed_10m)) ?? 0,
          isDay: c.is_day === 0 ? 0 : 1,
        },
        today: { code: num(d.weather_code?.[0]), max: round(num(d.temperature_2m_max?.[0])), min: round(num(d.temperature_2m_min?.[0])) },
        updated: Date.now(),
      }
      api.share()
      return true
    } catch (err) {
      api.log('the forecast could not be fetched:', String(err?.message || err))
      return false
    }
  }

  function schedule() {
    clearInterval(timer)
    timer = setInterval(() => void refresh(), EVERY)
    timer.unref?.()
  }

  const view = () =>
    place ? { city: place.city, country: place.country, current: reading?.current ?? null, today: reading?.today ?? null, updated: reading?.updated ?? null } : { city: null }

  api.part('weather', view)

  api.route('POST', '/weather/city', async (req, res, body) => {
    const name = String(body?.city ?? '').trim().slice(0, 80)
    if (!name) return api.json(res, 400, { error: 'Type a city first.' })
    let hit
    try {
      const q = new URLSearchParams({ name, count: '1', language: 'en', format: 'json' })
      hit = (await getJson(`${GEOCODE}?${q}`)).results?.[0]
    } catch (err) {
      api.log('the city lookup failed:', String(err?.message || err))
      return api.send(res, 502, 'The weather service could not be reached. Try again in a moment.')
    }
    if (!hit || num(hit.latitude) === null || num(hit.longitude) === null) return api.send(res, 404, `No city called "${name}" was found.`)
    place = {
      city: String(hit.name || name),
      country: String(hit.country || ''),
      latitude: hit.latitude,
      longitude: hit.longitude,
      timezone: String(hit.timezone || ''),
    }
    reading = null
    await save().catch(err => api.log('the city could not be saved:', String(err)))
    schedule()
    await refresh()
    api.share()
    api.json(res, 200, view())
  })

  api.route('POST', '/weather/clear', async (req, res) => {
    place = null
    reading = null
    clearInterval(timer)
    await rm(FILE, { force: true }).catch(() => {})
    api.share()
    api.json(res, 200, view())
  })

  // pick up a city saved earlier
  readFile(FILE, 'utf8')
    .then(text => {
      const p = JSON.parse(text)
      if (p && typeof p.city === 'string' && num(p.latitude) !== null && num(p.longitude) !== null) {
        place = { city: p.city, country: String(p.country || ''), latitude: p.latitude, longitude: p.longitude, timezone: String(p.timezone || '') }
        schedule()
        return refresh()
      }
    })
    .catch(() => {})
}
