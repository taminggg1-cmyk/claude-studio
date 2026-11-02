// How the studio's people move, whatever body they have. A person ("actor") runs a small queue of actions (walk a path,
// turn, step, sit, stand, wait, call back) and every frame works out a pose from what they are doing (typing,
// reading, thinking, resting, waving) and how they feel (in the flow, puzzled, cheering, stressed, panicking, putting
// out a fire). The pose is a handful of joint angles that a "rig" puts on a body:
//
//   - the built-in chibi figures in people.js, or
//   - a VRM character model (avatars.js), whose standard skeleton takes the same angles.
//
// Joint angles, all in radians, for a person facing +z:
//   drop        0 standing, 1 seated (the hips sink by the thigh's length)
//   lean/twist  the upper body bending forward / turning
//   tL tR kL kR thighs forward (negative) and knees bent (positive), left and right
//   aAx aBx     upper arms swung forward (negative), A is the person's left arm, B the right
//   aAz aBz     upper arms out to the side (A positive, B negative is outward)
//   eA eB       elbows bent (0 straight)
//   hX hY hZ    the head nodding down, turning left, tilting
//   slump       shoulders dropping (0 to 1)

import * as THREE from 'three'
import { P, cyl, mat, put, rbox, sph } from './kit.js'

export const JOINTS = ['drop', 'lean', 'twist', 'tL', 'tR', 'kL', 'kR', 'aAx', 'aAz', 'aBx', 'aBz', 'eA', 'eB', 'hX', 'hY', 'hZ', 'slump']

// ------------------------------------------------------------------------------------------------ props in hand

function cupProp() {
  const g = new THREE.Group()
  put(g, cyl(0.042, 0.038, 0.085, 16), mat(P.terracotta, { roughness: 0.45 }), 0, -0.02, 0.05)
  put(g, new THREE.TorusGeometry(0.024, 0.008, 6, 12), mat(P.terracotta, { roughness: 0.45 }), -0.048, -0.02, 0.05, { cast: false })
  return g
}

function penProp() {
  const g = new THREE.Group()
  const spin = new THREE.Group()
  spin.position.set(0, -0.03, 0.04)
  g.add(spin)
  put(spin, cyl(0.008, 0.008, 0.16, 8), mat(P.terracotta), 0, 0, 0, { rz: Math.PI / 2 })
  put(spin, cyl(0.009, 0.009, 0.03, 8), mat(P.brass, { metalness: 0.8, roughness: 0.3 }), 0.07, 0, 0, { rz: Math.PI / 2 })
  g.userData.spin = spin
  return g
}

/** The red fire extinguisher, held by its handle: the body hangs below the hand, the hose ends in a nozzle in front. */
export function extinguisherProp() {
  const g = new THREE.Group()
  const red = mat(0xd8342c, { roughness: 0.35, metalness: 0.15 })
  const black = mat(0x2a2522, { roughness: 0.6 })
  put(g, cyl(0.07, 0.07, 0.36, 18), red, 0, -0.24, 0)
  put(g, sph(0.07, 18, 10), red, 0, -0.06, 0, { s: [1, 0.55, 1] })
  put(g, sph(0.07, 18, 10), red, 0, -0.42, 0, { s: [1, 0.35, 1] })
  put(g, rbox(0.1, 0.04, 0.16, 0.01), mat(0xf2ead8), 0, -0.22, 0.068, { cast: false })
  put(g, cyl(0.025, 0.03, 0.06, 10), black, 0, 0.0, 0)
  put(g, rbox(0.03, 0.02, 0.12, 0.008), black, 0, 0.03, 0.03)
  const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0.05, -0.08, 0.12), new THREE.Vector3(0.02, -0.02, 0.24), new THREE.Vector3(0, 0.0, 0.32)])
  put(g, new THREE.TubeGeometry(hose, 12, 0.012, 6), black, 0, 0, 0)
  put(g, cyl(0.022, 0.012, 0.07, 10), black, 0, 0, 0.35, { rx: Math.PI / 2 })
  g.userData.nozzle = new THREE.Vector3(0, 0, 0.4)
  return g
}

// ------------------------------------------------------------------------------------------------ the actor

/**
 * A person: `root` is placed in the room; `rig` is the body inside it, and can be swapped (a chibi stand-in while a
 * character model loads). The returned object is driven with `update(dt, t)` once a frame.
 */
export function makeActor(id, rig) {
  const root = new THREE.Group()
  root.userData.personId = id
  root.add(rig.object)

  const J = { drop: 0, lean: 0, twist: 0, tL: 0, tR: 0, kL: 0, kR: 0, aAx: 0, aAz: 0.1, aBx: 0, aBz: -0.1, eA: 0.15, eB: 0.15, hX: 0, hY: 0, hZ: 0, slump: 0 }
  const T = { ...J }
  const props = { cup: cupProp(), pen: penProp(), extinguisher: extinguisherProp() }
  for (const p of Object.values(props)) p.visible = false
  const face = { happy: 0, sad: 0, surprised: 0, relaxed: 0, angry: 0, aa: 0 }

  const attachProps = r => {
    r.hand('B').add(props.cup, props.extinguisher)
    r.hand('A').add(props.pen)
  }
  attachProps(rig)

  const person = {
    id,
    root,
    rig,
    props,
    seated: false,
    /** What the hands do: idle, type, read, think, wave. */
    activity: 'idle',
    /** How they feel: calm, flow, thinking, stressed, panic. */
    mood: 'calm',
    /** A standing job that overrides the pose: 'panic' (running with hands on the head) or 'spray' (extinguisher). */
    action: null,
    /** Seconds of cheering left (a passing test, a fixed bug). */
    cheer: 0,
    /** Seconds of talking left (a speech bubble is up): the mouth opens and closes. */
    talking: 0,
    holding: null,
    queue: [],
    current: null,
    walking: false,
    phase: 0,
    sip: 0,
    nextSip: 6 + Math.random() * 10,
    blink: 0,
    nextBlink: 2 + Math.random() * 3,
    seed: Math.random() * 100,
    yawTarget: root.rotation.y,
    speed: 1.45,
    seat: null,

    /** Puts a new body in (the character model once it has loaded). */
    setRig(next) {
      root.remove(this.rig.object)
      this.rig.dispose?.()
      this.rig = next
      root.add(next.object)
      attachProps(next)
      root.traverse(o => {
        if (o.isMesh) o.userData.personId = id
      })
      next.settle?.()
    },
    /** Where the badge sits: just above the head. */
    anchor(out) {
      return this.rig.anchor(out)
    },
    headPos(out) {
      return this.rig.head(out)
    },
    /** The world position of what the person holds out in front (the extinguisher's nozzle). */
    nozzle(out) {
      props.extinguisher.updateWorldMatrix(true, false)
      return out.copy(props.extinguisher.userData.nozzle).applyMatrix4(props.extinguisher.matrixWorld)
    },
    hold(name) {
      this.holding = name
    },
    then(action) {
      this.queue.push(action)
      return this
    },
    walk(points) {
      return this.then({ type: 'walk', points: points.map(p => p.clone()) })
    },
    turn(yaw, dur = 0.3) {
      return this.then({ type: 'turn', yaw, dur })
    },
    step(to, dur = 0.5) {
      return this.then({ type: 'step', to: to.clone(), dur })
    },
    wait(dur) {
      return this.then({ type: 'wait', dur })
    },
    call(fn) {
      return this.then({ type: 'call', fn })
    },
    /** Waits until `fn()` is true (at most `max` seconds). */
    until(fn, max = 6) {
      return this.then({ type: 'until', fn, max })
    },
    sit() {
      return this.then({ type: 'call', fn: () => (this.seated = true) }).wait(0.45)
    },
    stand() {
      return this.then({ type: 'call', fn: () => (this.seated = false) }).wait(0.4)
    },
    /** Drops whatever was queued (a new plan follows). */
    clear() {
      this.queue.length = 0
      this.current = null
    },
    isBusy() {
      return this.current !== null || this.queue.length > 0
    },

    update(dt, t) {
      this.runQueue(dt)
      let dy = this.yawTarget - root.rotation.y
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      root.rotation.y += dy * (1 - Math.exp(-dt * 9))
      if (this.cheer > 0) this.cheer -= dt
      const bob = this.pose(T, t + this.seed, dt)
      const f = 1 - Math.exp(-dt * (this.walking ? 16 : 7))
      for (const key of JOINTS) J[key] += (T[key] - J[key]) * f

      // the face, for bodies that have one to change
      const m = this.cheer > 0 ? 'celebrate' : this.action === 'panic' ? 'panic' : this.mood
      const want = {
        happy: m === 'celebrate' ? 1 : m === 'flow' ? 0.35 : 0,
        sad: m === 'stressed' ? 0.75 : 0,
        surprised: m === 'panic' ? 0.9 : 0,
        relaxed: m === 'calm' && !this.walking ? 0.25 : 0,
        angry: this.action === 'spray' ? 0.35 : 0,
        aa: 0,
      }
      for (const k in face) face[k] += (want[k] - face[k]) * Math.min(1, dt * 6)
      // talking: the mouth ('aa') opens and closes in an uneven rhythm, and eases shut when the line is done
      if (this.talking > 0) this.talking -= dt
      const kt = t + this.seed
      face.aa = this.talking > 0 ? Math.min(1, this.talking * 5) * (0.15 + 0.45 * Math.abs(Math.sin(kt * 11.5)) * (0.65 + 0.35 * Math.sin(kt * 3.1))) : 0
      this.nextBlink -= dt
      if (this.nextBlink <= 0) {
        this.blink = 0.14
        this.nextBlink = 2.5 + Math.random() * 4
      }
      this.blink -= dt
      const closed = this.blink > 0 ? 1 : m === 'celebrate' ? 0.15 : 0

      props.cup.visible = this.sip > 0 && this.seated
      props.pen.visible = this.seated && (this.activity === 'think' || this.mood === 'thinking') && this.cheer <= 0 && this.mood !== 'stressed'
      props.pen.userData.spin.rotation.y = t * 9
      props.extinguisher.visible = this.holding === 'extinguisher'
      if (this.seat) this.seat.deskMug.visible = !props.cup.visible
      this.rig.apply(J, bob, dt, face, closed)
    },

    /** Fills `T` with the pose for this moment and returns the body's bob. */
    pose(T, k, dt) {
      T.drop = 0
      T.lean = T.twist = 0
      T.tL = T.tR = T.kL = T.kR = 0
      T.aAx = T.aBx = 0
      T.aAz = 0.1
      T.aBz = -0.1
      T.eA = T.eB = 0.15
      T.hX = T.hY = T.hZ = 0
      T.slump = 0
      let bob = 0
      const cheering = this.cheer > 0
      const handsOnHead = () => {
        T.aAx = T.aBx = -2.55
        T.aAz = 0.55
        T.aBz = -0.55
        T.eA = T.eB = 2.1
        T.hY = Math.sin(k * 9) * 0.3
      }
      const armsUp = () => {
        const pump = Math.sin(k * 13)
        T.aAx = -2.75 + pump * 0.22
        T.aBx = -2.75 - pump * 0.22
        T.aAz = 0.3
        T.aBz = -0.3
        T.eA = 0.55 + pump * 0.4
        T.eB = 0.55 - pump * 0.4
        T.hX = -0.22
        T.hY = Math.sin(k * 3) * 0.15
      }

      if (this.walking) {
        const run = this.action === 'panic'
        this.phase += dt * this.speed * (run ? 4.6 : 6.2)
        const s = Math.sin(this.phase)
        const stride = run ? 0.85 : 0.62
        T.tL = s * stride
        T.tR = -s * stride
        T.kL = Math.max(0, -Math.cos(this.phase)) * (run ? 1.1 : 0.75)
        T.kR = Math.max(0, Math.cos(this.phase)) * (run ? 1.1 : 0.75)
        T.aAx = -s * 0.55
        T.aBx = s * 0.55
        T.eA = T.eB = 0.3
        T.hY = Math.sin(this.phase * 0.5) * 0.04
        bob = Math.abs(Math.cos(this.phase)) * (run ? 0.06 : 0.035)
        if (run) {
          handsOnHead()
          T.lean = 0.12
        } else if (this.holding === 'extinguisher') {
          T.aBx = -0.35
          T.eB = 0.5
          T.aBz = -0.2
        }
        return bob
      }

      if (!this.seated) {
        if (this.action === 'spray') {
          // aiming the extinguisher at the fire with both hands, braced
          T.aBx = -1.05
          T.eB = 0.25
          T.aBz = 0.15
          T.aAx = -1.2
          T.eA = 0.5
          T.aAz = -0.35
          T.lean = 0.12
          T.tL = -0.25
          T.kL = 0.3
          T.tR = 0.15
          T.hX = 0.12
          T.twist = Math.sin(k * 2.2) * 0.12
          return Math.sin(k * 6) * 0.004
        }
        if (this.action === 'panic') {
          handsOnHead()
          return Math.abs(Math.sin(k * 10)) * 0.04
        }
        if (cheering) {
          armsUp()
          return Math.abs(Math.sin(k * 6.5)) * 0.06
        }
        if (this.mood === 'stressed') {
          // shoulders dropped, head hanging, arms dangling
          T.slump = 1
          T.lean = 0.22
          T.hX = 0.45
          T.hY = Math.sin(k * 0.7) * 0.15
          T.aAz = 0.04
          T.aBz = -0.04
          T.eA = T.eB = 0.1
          return Math.sin(k * 1.2) * 0.004
        }
        if (this.mood === 'thinking') {
          // one arm across the body, the other hand at the chin
          T.aBx = -0.38
          T.aBz = 0.32
          T.eB = 2.3 + Math.sin(k * 9) * 0.07
          T.aAx = -0.35
          T.aAz = -0.05
          T.eA = 1.5
          T.hZ = 0.14 + Math.sin(k * 0.5) * 0.05
          T.hY = Math.sin(k * 0.35) * 0.3
          T.hX = -0.12
          return 0
        }
        if (this.mood === 'flow') {
          // bopping to the music
          const beat = Math.sin(k * 7.6)
          T.hX = 0.05 + beat * 0.12
          T.hZ = Math.sin(k * 3.8) * 0.1
          T.twist = Math.sin(k * 3.8) * 0.1
          T.aAx = -0.2
          T.aBx = -0.2
          T.eA = T.eB = 0.9 + beat * 0.15
          return Math.abs(beat) * 0.02
        }
        // standing: breathe and look around a little
        T.aAz = 0.1 + Math.sin(k * 1.2) * 0.02
        T.aBz = -0.1 - Math.sin(k * 1.2) * 0.02
        T.hY = Math.sin(k * 0.4) * 0.3
        return Math.sin(k * 2) * 0.006
      }

      // ---- seated
      T.drop = 1
      T.tL = T.tR = -1.48
      T.kL = 1.45 + Math.sin(k * 1.1) * 0.08
      T.kR = 1.45 - Math.sin(k * 1.1) * 0.08
      let a = this.activity
      const mood = this.mood
      if (mood === 'flow' && a !== 'wave') a = 'type'
      if (mood === 'thinking' && a !== 'wave') a = 'think'

      if (cheering) {
        armsUp()
        T.lean = -0.1
        bob = Math.abs(Math.sin(k * 6.5)) * 0.02
      } else if (mood === 'stressed' || mood === 'panic') {
        // slumped over the desk, head in hands
        T.lean = 0.42
        T.slump = 1
        T.aAx = T.aBx = -1.05 + Math.sin(k * 1.3) * 0.05
        T.aAz = -0.3
        T.aBz = 0.3
        T.eA = T.eB = 2.25
        T.hX = 0.5
        T.hY = Math.sin(k * 0.7) * 0.18
      } else if (a === 'type') {
        T.aAx = -0.5
        T.aBx = -0.5
        T.eA = 1.2 + Math.sin(k * 17) * 0.09
        T.eB = 1.2 + Math.sin(k * 17 + 1.9) * 0.09
        T.aAz = -0.12
        T.aBz = 0.12
        T.hX = 0.12 + Math.sin(k * 2.3) * 0.03
        T.hY = Math.sin(k * 0.4) * 0.06
        T.lean = 0.06
        if (mood === 'flow') {
          // bopping to the music
          const beat = Math.sin(k * 7.6)
          T.hX = 0.08 + beat * 0.12
          T.hZ = Math.sin(k * 3.8) * 0.08
          T.twist = Math.sin(k * 3.8) * 0.06
          bob = Math.abs(beat) * 0.008
        }
      } else if (a === 'read') {
        T.aAx = -0.45
        T.eA = 1.05 + Math.max(0, Math.sin(k * 1.7)) * 0.08
        T.aBx = -0.42
        T.eB = 1.0
        T.aAz = -0.1
        T.aBz = 0.1
        T.hX = 0.2
        T.hY = Math.sin(k * 0.9) * 0.16
        T.lean = 0.1
      } else if (a === 'think') {
        // right hand scratching the chin, a pen turning in the left
        T.aBx = -0.38
        T.aBz = 0.32
        T.eB = 2.3 + Math.sin(k * 9) * 0.07
        T.aAx = -0.55
        T.aAz = -0.05
        T.eA = 1.05
        T.hZ = 0.14 + Math.sin(k * 0.5) * 0.05
        T.hY = Math.sin(k * 0.35) * 0.3
        T.hX = -0.12
        T.lean = -0.06
      } else if (a === 'wave') {
        T.aAx = -0.5
        T.eA = 1.2
        T.aBx = -0.5
        T.eB = 1.2
        T.aAz = -0.12
        T.aBz = 0.12
        T.hX = 0.1
        if (k % 7 < 1.6) {
          T.aAx = -2.7
          T.eA = 0.4
          T.aAz = 0.35 + Math.sin(k * 10) * 0.35
          T.hY = 0.4
          T.hX = -0.05
        }
      } else {
        // resting: lean back, hands in the lap, looking around the room
        T.lean = -0.13
        T.aAx = T.aBx = -0.3
        T.eA = T.eB = 0.7
        T.aAz = -0.1
        T.aBz = 0.1
        T.hY = Math.sin(k * 0.3) * 0.45
        T.hX = -0.06 + Math.sin(k * 0.21) * 0.05
      }

      // a sip of coffee now and then, when nothing is on fire
      this.nextSip -= dt
      const calm = !cheering && mood !== 'stressed' && mood !== 'panic' && a !== 'wave'
      if (this.nextSip <= 0 && this.sip <= 0 && calm) {
        this.sip = 2.6
        this.nextSip = 9 + Math.random() * 14
      }
      if (this.sip > 0) {
        this.sip -= dt
        if (calm) {
          const up = this.sip <= 2.2 && this.sip >= 0.4
          T.aBx = up ? -0.75 : -0.6
          T.eB = up ? 2.35 : 1.6
          T.aBz = 0.25
          T.hX = up ? -0.18 : 0.05
          T.hY = 0
        } else this.sip = 0
      }
      return bob
    },

    runQueue(dt) {
      if (!this.current && this.queue.length) {
        this.current = this.queue.shift()
        this.current.t = 0
        if (this.current.type === 'step' || this.current.type === 'turn') {
          this.current.from = root.position.clone()
          this.current.yawFrom = root.rotation.y
        }
      }
      const c = this.current
      this.walking = false
      if (!c) return
      c.t += dt
      switch (c.type) {
        case 'walk': {
          const target = c.points[0]
          if (!target) {
            this.current = null
            break
          }
          const d = new THREE.Vector3().subVectors(target, root.position)
          d.y = 0
          const dist = d.length()
          const stepLen = this.speed * (this.action === 'panic' ? 1.7 : 1) * dt
          if (dist <= stepLen) {
            root.position.x = target.x
            root.position.z = target.z
            c.points.shift()
            if (!c.points.length) this.current = null
          } else {
            d.multiplyScalar(stepLen / dist)
            root.position.add(d)
            this.yawTarget = Math.atan2(d.x, d.z)
          }
          this.walking = true
          break
        }
        case 'turn':
          this.yawTarget = c.yaw
          if (c.t >= c.dur) this.current = null
          break
        case 'step': {
          const u = Math.min(1, c.t / c.dur)
          const e = u * u * (3 - 2 * u)
          root.position.lerpVectors(c.from, c.to, e)
          if (u >= 1) this.current = null
          break
        }
        case 'wait':
          if (c.t >= c.dur) this.current = null
          break
        case 'until':
          if (c.fn() || c.t >= c.max) this.current = null
          break
        case 'call':
          this.current = null
          c.fn()
          break
      }
    },
  }
  return person
}
