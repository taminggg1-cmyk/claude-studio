// When things go wrong in the session, the studio shows it. Each person carries a count of errors in a row
// (`strikes`, sent by the mod):
//
//   1 or 2   they look stressed (motion.js and the mood effects in office.js)
//   3 or 4   smoke curls up from their desk
//   5 +      cartoon fire breaks out around the desk, with glowing bugs in the flames; the sprinklers come on; the
//            person jumps up and runs laps round their desk pod with their hands on their head; and Claude (or the
//            first free colleague, if it is Claude's desk burning) fetches the extinguisher from the wall and sprays
//            the fire until a success comes in and the count drops
//
// When the count drops, the fire dies down in a puff of steam, the person goes back to their seat, and whoever
// fought the fire hangs the extinguisher back up and returns to work.

import * as THREE from 'three'
import { TILE } from './fx.js'

const SMOKE_AT = 3
const FIRE_AT = 5
/** Walking and running speeds (room units a second): the firefighter hurries to the extinguisher and the fire. */
const WALK = 1.45
const RUN = 2.4

const rnd = (a, b) => a + Math.random() * (b - a)

/**
 * `ctx` gives the room (`world`), the people map, the effects layer, and the seating helpers from office.js
 * (`seatSpot(seat)`, `faceYaw(seat)`, `aisleZ`).
 */
export function makeChaos(scene, ctx) {
  const { world, people, fx, seatSpot, faceYaw, aisleZ } = ctx
  const v3 = (x, z) => new THREE.Vector3(x, 0, z)
  const fires = new Map() // person id -> { entry, seat, heat, out, light, timers }
  // two lights made once: adding lights later would make three.js rebuild every material
  const lights = [0, 1].map(() => {
    const l = new THREE.PointLight(0xff8a3a, 0, 4.5, 1.6)
    scene.add(l)
    return { light: l, fire: null }
  })
  const timers = new Map()
  const due = (key, every, dt) => {
    const t = (timers.get(key) ?? Math.random() * every) - dt
    if (t <= 0) {
      timers.set(key, t + every)
      return true
    }
    timers.set(key, t)
    return false
  }
  const tmp = new THREE.Vector3()
  const dir = new THREE.Vector3()

  // ---------------------------------------------------------------- moving people

  /** Gets up from the desk: chair rolls out, stand, step back to the approach spot. */
  function rise(entry) {
    const { p, seat } = entry
    p.call(() => (seat.pullWant = 1))
      .stand()
      .wait(0.15)
      .step(seat.approach, 0.45)
      .call(() => (seat.pullWant = 0))
  }

  /** Walks back to the desk (from the approach spot) and sits down. */
  function sitBack(entry, path, after) {
    const { p, seat } = entry
    p.walk([...path, seat.approach])
      .call(() => (seat.pullWant = 1))
      .turn(faceYaw(seat), 0.3)
      .step(seatSpot(seat), 0.55)
      .sit()
      .call(() => {
        seat.pullWant = 0
        seat.want = 1
        after?.()
      })
  }

  /** The four corners of a lap round the person's desk pod, starting with the one nearest their seat. */
  function lap(seat) {
    const { x, z } = seat.pod
    const out = x - seat.face * 2.05 // the side of the pod this seat looks out from
    const other = x + seat.face * 2.05
    const near = seat.z < z ? -1 : 1
    return [v3(out, z + near * 1.75), v3(other, z + near * 1.75), v3(other, z - near * 1.75), v3(out, z - near * 1.75)]
  }

  function startPanic(fire) {
    const { entry } = fire
    entry.state = 'panic'
    rise(entry)
    entry.p.call(() => (entry.p.action = 'panic'))
    const corners = lap(fire.seat)
    let i = 0
    const leg = () => {
      const p = entry.p
      if (entry.state !== 'panic') return
      // standing at corners[i - 1] (or, at the start, beside the desk): corners 0 and 3 are on the seat's own side
      const onOwnSide = i % 4 === 0 || i % 4 === 1
      if (fire.out && onOwnSide) {
        p.action = null
        entry.state = 'returning'
        p.cheer = 0
        sitBack(entry, [], () => {
          entry.state = 'working'
          p.cheer = 3.2
        })
        return
      }
      p.walk([corners[i % 4]]).call(leg)
      i++
    }
    entry.p.walk([v3(corners[0].x, entry.seat.z)]).call(leg)
  }

  /** Where the firefighter stands: just outside the pod on the aisle side, in line with the burning desk. */
  function sprayStand(seat) {
    const side = aisleZ > seat.pod.z ? 1 : -1
    return v3(seat.desk.x, seat.pod.z + side * 2.35)
  }

  function startFirefighter(fire, entry) {
    const { p, seat } = entry
    const ext = world.extinguisher
    entry.state = 'firefighting'
    fire.fighter = entry
    const stand = sprayStand(fire.seat)
    rise(entry)
    p.call(() => (p.speed = RUN))
    p.walk([v3(seat.approach.x, aisleZ), v3(ext.spot.x, aisleZ), ext.spot])
      .turn(ext.yaw, 0.3)
      .wait(0.25)
      .call(() => {
        ext.onWall.visible = false
        p.hold('extinguisher')
      })
      .wait(0.3)
      .walk([v3(ext.spot.x, aisleZ), v3(stand.x, aisleZ), stand])
      .call(() => {
        const d = fire.seat.desk
        p.yawTarget = Math.atan2(d.x - p.root.position.x, d.z - p.root.position.z)
        p.action = 'spray'
      })
      .until(() => fire.out, 600)
      .call(() => goHome(entry))
  }

  function goHome(entry) {
    const { p, seat } = entry
    const ext = world.extinguisher
    p.action = null
    entry.state = 'returning'
    for (const fire of fires.values()) if (fire.fighter === entry) fire.fighter = null
    const here = p.root.position
    p.walk([v3(here.x, aisleZ), v3(ext.spot.x, aisleZ), ext.spot])
      .turn(ext.yaw, 0.3)
      .call(() => {
        ext.onWall.visible = true
        p.hold(null)
        p.speed = WALK
      })
      .wait(0.3)
    sitBack(entry, [v3(ext.spot.x, aisleZ), v3(seat.approach.x, aisleZ)], () => {
      entry.state = 'working'
      p.cheer = 2.2
    })
  }

  /**
   * Someone at their desk who can get up and help: the lead of the session whose desk burns first (unless it is the
   * lead's own desk), then any other lead, then anyone.
   */
  function findFighter(fire) {
    const free = e => e && e !== fire.entry && e.ready !== false && e.state === 'working' && e.p.seated && !e.p.isBusy() && e.seat
    const session = fire.entry?.info?.session
    const leads = [...people.values()].filter(e => e.isLead || e.id === 'claude')
    const own = leads.find(e => e.info?.session === session)
    if (free(own)) return own
    for (const e of leads) if (free(e)) return e
    for (const e of people.values()) if (free(e)) return e
    return null
  }

  /** A person who walks out (their agent ended) drops everything first. */
  function release(entry) {
    for (const fire of fires.values()) {
      if (fire.fighter === entry) fire.fighter = null
      if (fire.entry === entry) fire.out = true
    }
    if (entry.p.holding === 'extinguisher') {
      entry.p.hold(null)
      world.extinguisher.onWall.visible = true
    }
    entry.p.action = null
    entry.p.speed = WALK
  }

  // ---------------------------------------------------------------- each frame

  function update(dt, t) {
    for (const entry of people.values()) {
      const seat = entry.seat
      const strikes = Number(entry.info?.strikes) || 0
      const atDesk = seat && (entry.state === 'working' || entry.state === 'panic' || entry.state === 'returning')
      const fire = fires.get(entry.id)
      if (strikes >= FIRE_AT && atDesk) {
        if (!fire) {
          const f = { entry, seat, heat: 0, out: false, fighter: null, born: t }
          fires.set(entry.id, f)
          const slot = lights.find(l => !l.fire)
          if (slot) slot.fire = f
        } else if (fire.out && fire.heat > 0.3) fire.out = false // it flared up again
      } else if (fire && !fire.out) {
        fire.out = true
        // the fire goes out with a hiss of steam
        for (let i = 0; i < 26; i++)
          fx.emit(TILE.steam, tmp.copy(seat.desk).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(0, 0.3), rnd(-0.4, 0.4))), {
            vel: [rnd(-0.3, 0.3), rnd(0.8, 1.6), rnd(-0.3, 0.3)],
            drag: 1.2,
            life: rnd(1.2, 2),
            size: 0.2,
            grow: 0.7,
            alpha: 0.8,
          })
      }
      // smoke while the count is high (before and under the fire)
      if (seat && atDesk && strikes >= SMOKE_AT && due(`smoke${entry.id}`, strikes >= FIRE_AT ? 0.1 : 0.2, dt)) {
        fx.emit(TILE.smoke, tmp.copy(seat.desk).add(new THREE.Vector3(rnd(-0.35, 0.35), 0.05, rnd(-0.25, 0.25))), {
          vel: [rnd(-0.08, 0.08), rnd(0.45, 0.7), rnd(-0.08, 0.08)],
          drag: 0.3,
          life: rnd(1.8, 2.6),
          size: 0.16,
          grow: 0.6,
          alpha: strikes >= FIRE_AT ? 0.85 : 0.65,
          spinRate: rnd(-1, 1),
          wobble: 0.05,
        })
        if (Math.random() < 0.25)
          fx.emit(TILE.ember, tmp.copy(seat.desk).add(new THREE.Vector3(rnd(-0.3, 0.3), 0.05, rnd(-0.2, 0.2))), {
            vel: [rnd(-0.2, 0.2), rnd(0.8, 1.3), rnd(-0.2, 0.2)],
            life: 0.7,
            size: 0.06,
            additive: true,
            wobble: 0.04,
          })
      }
    }

    for (const [id, fire] of [...fires]) {
      if (!people.has(id)) fire.out = true
      fire.heat += ((fire.out ? 0 : 1) - fire.heat) * (1 - Math.exp(-dt * (fire.out ? 1.6 : 0.9)))
      const d = fire.seat.desk
      const h = fire.heat
      // flames on the desk and on the floor round it, embers, and the bugs that started it all
      const flameRate = Math.max(0, h) * 34
      for (let n = Math.floor(dt * flameRate + Math.random()); n > 0; n--) {
        const onDesk = Math.random() < 0.55
        const at = onDesk
          ? tmp.set(d.x + rnd(-0.55, 0.55), d.y + 0.02, d.z + rnd(-0.3, 0.3))
          : (() => {
              const a = Math.random() * Math.PI * 2
              const r = rnd(0.7, 1.05)
              return tmp.set(d.x + Math.cos(a) * r, 0.02, d.z + Math.sin(a) * r * 0.8)
            })()
        const size = rnd(0.34, 0.62) * (0.5 + h * 0.5)
        fx.emit(TILE.flame, at, {
          vel: [rnd(-0.06, 0.06), rnd(0.7, 1.2), rnd(-0.06, 0.06)],
          life: rnd(0.45, 0.8),
          size,
          grow: 0.1,
          spin: rnd(-0.25, 0.25),
          wobble: 0.04,
        })
        // and a warm glow round each tongue, so the fire lights up its corner even in daylight
        if (Math.random() < 0.35)
          fx.emit(TILE.glow, at, { vel: [0, 0.5, 0], life: 0.5, size: size * 2.2, grow: size, color: 0xff7a2a, alpha: 0.5, additive: true })
      }
      if (h > 0.3 && due(`ember${id}`, 0.07, dt))
        fx.emit(TILE.ember, tmp.set(d.x + rnd(-0.6, 0.6), d.y + 0.1, d.z + rnd(-0.35, 0.35)), {
          vel: [rnd(-0.3, 0.3), rnd(1.2, 2), rnd(-0.3, 0.3)],
          life: rnd(0.6, 1.1),
          size: 0.07,
          additive: true,
          wobble: 0.08,
        })
      if (!fire.out && due(`bug${id}`, 0.55, dt))
        fx.emit(TILE.bug, tmp.set(d.x + rnd(-0.5, 0.5), d.y + rnd(0.1, 0.35), d.z + rnd(-0.3, 0.3)), {
          vel: [rnd(-0.15, 0.15), rnd(0.15, 0.35), rnd(-0.15, 0.15)],
          life: rnd(1.2, 1.8),
          size: 0.17,
          fade: 'inout',
          spin: rnd(-0.6, 0.6),
          spinRate: rnd(-2, 2),
          wobble: 0.12,
        })
      // the sprinklers over the desk
      if (!fire.out)
        for (let n = Math.floor(dt * 90 + Math.random()); n > 0; n--)
          fx.emit(TILE.water, tmp.set(d.x + rnd(-1.6, 1.6), 3.85, d.z + rnd(-1.3, 1.3)), {
            vel: [rnd(-0.1, 0.1), -4.5, rnd(-0.1, 0.1)],
            gravity: 5,
            life: 0.72,
            size: 0.055,
            alpha: 0.75,
          })
      // foam from the extinguisher
      const f = fire.fighter
      if (f && f.p.action === 'spray' && h > 0.05)
        for (let n = Math.floor(dt * 70 + Math.random()); n > 0; n--) {
          const from = f.p.nozzle(new THREE.Vector3())
          dir.set(d.x - from.x, d.y + 0.15 - from.y, d.z - from.z).normalize()
          const sp = rnd(2.6, 3.6)
          fx.emit(TILE.foam, from, {
            vel: [dir.x * sp + rnd(-0.25, 0.25), dir.y * sp + rnd(0, 0.4), dir.z * sp + rnd(-0.25, 0.25)],
            drag: 1.1,
            gravity: 1.2,
            life: rnd(0.7, 1.0),
            size: 0.07,
            grow: 0.38,
            alpha: 0.95,
          })
        }
      // people react: the owner panics, someone fetches the extinguisher
      const e = fire.entry
      if (!fire.out && e.state === 'working' && e.p.seated && !e.p.isBusy() && t - fire.born > 0.6) startPanic(fire)
      if (!fire.out && !fire.fighter && t - fire.born > 1.2) {
        const helper = findFighter(fire)
        if (helper) startFirefighter(fire, helper)
      }
      if (fire.out && fire.heat < 0.02 && e.state !== 'panic' && (!fire.fighter || fire.fighter.state !== 'firefighting')) {
        fires.delete(id)
        const slot = lights.find(l => l.fire === fire)
        if (slot) slot.fire = null
      }
    }
    for (const slot of lights) {
      const f = slot.fire
      if (!f) {
        slot.light.intensity = 0
        continue
      }
      slot.light.position.set(f.seat.desk.x, 1.0, f.seat.desk.z)
      slot.light.intensity = f.heat * (5 + Math.sin(t * 17) * 1.2 + Math.sin(t * 29) * 0.8)
    }
  }

  return {
    update,
    release,
    /** For checks: who is burning and who is fighting it. */
    state: () => [...fires.values()].map(f => ({ id: f.entry.id, heat: +f.heat.toFixed(2), out: f.out, fighter: f.fighter?.id ?? null })),
  }
}
