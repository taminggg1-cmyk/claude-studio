// The server side of the decorate feature (see the 'server features' section of ../server.mjs for the api). It keeps
// the room's design in ~/.claude/studio-room.json (CLAUDE_STUDIO_ROOM moves it), sends it to every window as the
// snapshot's `room` part, saves a new one on POST /room (after a strict check) and goes back to the loft on
// POST /room/reset. A window that has never been decorated gets room: null and shows the loft as it always was.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { checkDesign } from '../design.js'

export default function setup(api) {
  const file = process.env.CLAUDE_STUDIO_ROOM || join(api.HOME, 'studio-room.json')
  /** The saved design, or null while the room is the default loft. */
  let saved = null

  try {
    const got = checkDesign(JSON.parse(readFileSync(file, 'utf8')))
    if (got.ok) saved = got.design
    else api.log('the saved room design was not valid, using the loft:', got.error)
  } catch {
    // no file yet: the loft
  }

  const store = design => {
    try {
      mkdirSync(dirname(file), { recursive: true })
      const tmp = `${file}.tmp`
      if (design) {
        writeFileSync(tmp, JSON.stringify(design, null, 2))
        renameSync(tmp, file)
      } else writeFileSync(file, '{}')
    } catch (err) {
      api.log('could not save the room design:', String(err?.message || err))
    }
  }

  api.part('room', () => saved)

  api.route('POST', '/room', (req, res, body) => {
    const got = checkDesign(body)
    if (!got.ok) return api.json(res, 400, { error: got.error })
    saved = got.design
    store(saved)
    api.share()
    api.json(res, 200, { ok: true, room: saved })
  })

  api.route('POST', '/room/reset', (req, res) => {
    saved = null
    store(null)
    api.share()
    api.json(res, 200, { ok: true, room: null })
  })
}
