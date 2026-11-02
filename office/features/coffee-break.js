// The coffee break. A Claude whose human has been quiet for a while (the "your-turn" feature sends
// extras['your-turn'] = { waiting: 'you' | 'approve' | null, since }) gets up after 45 seconds, walks to the coffee
// counter, takes a cup, and drifts to the bistro table, the lounge or the sofa. If another Claude is on a break, the
// two stand side by side, face each other and take turns saying friendly lines. When the human types (waiting is no
// longer 'you'), or the desk catches fire, the Claude walks straight back and sits down.
//
// Demo: ?coffee on a demo page (?sessions=2&coffee) pretends both humans are quiet for the first minute.

const WAIT_MS = 45000
const DEMO_MS = 60000

const rnd = (a, b) => a + Math.random() * (b - a)

const WAITING = [
  'Still no word from my human.',
  'Mine went quiet again.',
  'Any news from yours?',
  'I asked a question a while ago.',
  'They will be back soon, I hope.',
  'Waiting is the hard part.',
]
const COFFEE = [
  'This coffee is lovely.',
  'Oat flat white, my favourite.',
  'The machine hums so nicely.',
  'One more cup and I am ready.',
  'Nothing beats a warm cup.',
]
const WEATHER = [
  'Nice light through the windows today.',
  'Looks calm outside.',
  'Is it sunny out there?',
  'Feels like rain later.',
]
const REPLIES = ['Ha, same here.', 'I know what you mean.', 'Oh, nice!', 'True, true.', 'Mm, good point.', 'Right?']
const ALONE = ['Mm, good coffee.', 'Quiet in here.', 'Just a quick break.', 'Back soon, I promise.', 'Steam and silence.']

export function makeCoffeeBreak(ctx) {
  const { people, world, aisleZ, v3, params } = ctx
  const demoSwitch = !!ctx.isDemo && params.has('coffee')
  const demoStart = Date.now()

  // where to stand with a coffee: two spots side by side make a pair; `look` is what each one faces when alone
  const lounge = world.lounge ?? []
  const table = { x: -4.7, z: -3.4 }
  const SPOTS = [
    { x: -5.69, z: -3.76, look: table },
    { x: -4.52, z: -4.43, look: table },
    { x: -5.06, z: -2.41, look: table },
    { x: -3.69, z: -3.1, look: table },
    { x: lounge[0]?.x ?? -3.0, z: lounge[0]?.z ?? -1.4, look: { x: -3.7, z: -1.65 } },
    { x: lounge[1]?.x ?? -4.4, z: lounge[1]?.z ?? -1.9, look: { x: -3.7, z: -1.65 } },
    { x: -5.7, z: 3.95, look: { x: -4.9, z: 4.7 } },
    { x: -4.1, z: 3.95, look: { x: -4.9, z: 4.7 } },
  ]
  const PAIRS = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
  ]
  // standing places at the coffee counter, in front of the espresso machine
  const SLOTS = [-6.85, -6.1, -7.6].map(x => ({ x, z: -5.75, look: { x, z: -6.6 }, by: null }))
  const taken = new Map() // spot index -> lead id
  const breaks = new Map() // lead id -> the break
  const used = new Map() // lead id -> the `since` of the last waiting spell that already had a break
  let clock = 0

  const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z)
  const pairOf = i => PAIRS.find(p => p.includes(i))

  function demoWaiting() {
    if (Date.now() - demoStart > DEMO_MS) return { waiting: null, since: 0 }
    return { waiting: 'you', since: demoStart - WAIT_MS + 3000 }
  }

  function leadFor(session) {
    return people.get(session.id ? `lead:${session.id}` : 'claude')
  }

  function burning(entry) {
    return !!ctx.chaos?.state?.().some(f => f.id === entry.id)
  }

  /** A spot for a new break: beside someone who is already out here, else the first pair that is entirely free. */
  function chooseSpot() {
    for (const [i, who] of taken) {
      const pair = pairOf(i)
      const other = pair?.find(j => j !== i)
      if (other !== undefined && !taken.has(other) && breaks.get(who)?.phase !== 'back') return other
    }
    const free = PAIRS.filter(p => p.every(i => !taken.has(i)))
    if (free.length) return free[Math.floor(Math.random() * free.length)][0]
    return SPOTS.findIndex((_, i) => !taken.has(i))
  }

  function release(b) {
    if (b.spot >= 0 && taken.get(b.spot) === b.entry.id) taken.delete(b.spot)
    if (b.slot && b.slot.by === b.entry.id) b.slot.by = null
  }

  /** Forgets a break without walking anywhere (the person left, or something else took over). */
  function drop(b) {
    release(b)
    b.entry.p.hold?.(null)
    if (b.entry.away === 'coffee-break') b.entry.away = null
    breaks.delete(b.entry.id)
  }

  function start(entry) {
    const spot = chooseSpot()
    if (spot < 0 || !entry.seat) return
    const slot = SLOTS.find(s => !s.by) ?? SLOTS[0]
    const b = { entry, spot, slot, phase: 'standing', arrived: false, wantBack: false, talk: 0, myTurn: true, paired: false, seen: [] }
    breaks.set(entry.id, b)
    taken.set(spot, entry.id)
    slot.by = entry.id
    entry.away = 'coffee-break'
    const { p, seat } = entry
    const target = SPOTS[spot]
    ctx.standUp(entry)
    p.call(() => {
      if (b.wantBack) return goBack(b)
      b.phase = 'out'
    })
      .walk([v3(seat.approach.x, aisleZ), v3(slot.x, aisleZ), v3(slot.x, slot.z)])
      .turn(yawTo(slot, slot.look), 0.3)
      .call(() => (b.phase = 'getting'))
      .wait(1.6)
      .call(() => {
        p.hold('cup')
      })
      .wait(0.4)
      .call(() => {
        if (slot.by === entry.id) slot.by = null
      })
      .walk([v3(target.x, target.z)])
      .turn(yawTo(target, target.look), 0.4)
      .call(() => {
        b.phase = 'chat'
        b.arrived = true
        b.talk = rnd(2, 4)
      })
  }

  /** Walks straight back to the desk and sits down. */
  function goBack(b) {
    if (b.phase === 'back') return
    const { entry } = b
    const { p, seat } = entry
    if (b.phase === 'standing') {
      b.wantBack = true // still getting up: the walk back starts as soon as they stand
      return
    }
    release(b)
    b.phase = 'back'
    b.arrived = false
    if (!seat) return drop(b)
    p.clear()
    const at = p.root.position
    p.walk([v3(at.x, aisleZ), v3(seat.approach.x, aisleZ), seat.approach]).call(() => p.hold(null))
    ctx.sitDown(entry)
    p.call(() => breaks.delete(entry.id))
  }

  function partnerOf(b) {
    const pair = pairOf(b.spot)
    const other = pair?.find(j => j !== b.spot)
    const id = other === undefined ? null : taken.get(other)
    const o = id ? breaks.get(id) : null
    return o && o.phase === 'chat' && o.arrived ? o : null
  }

  function line(b, pool) {
    const folder = b.entry.info?.sessionName
    const list = folder && pool === WAITING ? [...pool, `I am deep in ${folder} today.`, `${folder} keeps me busy.`] : pool
    const fresh = list.filter(l => !b.seen.includes(l))
    const pick = (fresh.length ? fresh : list)[Math.floor(Math.random() * (fresh.length || list.length))]
    b.seen.push(pick)
    if (b.seen.length > 6) b.seen.shift()
    return pick
  }

  function chat(b, dt) {
    const partner = partnerOf(b)
    const { entry } = b
    if (!!partner !== b.paired) {
      b.paired = !!partner
      b.talk = rnd(1.5, 3)
      const to = partner ? partner.entry.p.root.position : SPOTS[b.spot].look
      if (!entry.p.isBusy()) entry.p.turn(yawTo(entry.p.root.position, to), 0.4)
    }
    if (partner) {
      if (b.entry.id > partner.entry.id) return // the other one keeps the time for both
      b.talk -= dt
      if (b.talk > 0) return
      b.talk = rnd(6, 10)
      const speaker = b.myTurn ? b : partner
      const first = !speaker.spoke
      speaker.spoke = true
      const pool = first ? WAITING : [COFFEE, WEATHER, WAITING, REPLIES][Math.floor(Math.random() * 4)]
      ctx.sayText(speaker.entry, line(speaker, pool))
      b.myTurn = !b.myTurn
    } else {
      b.talk -= dt
      if (b.talk > 0) return
      b.talk = rnd(12, 20)
      ctx.sayText(entry, line(b, ALONE))
    }
  }

  function tick(dt) {
    const sessions = ctx.sessions?.() ?? []
    for (const s of sessions) {
      const entry = leadFor(s)
      if (!entry) continue
      const w = demoSwitch ? demoWaiting() : s.state?.extras?.['your-turn']
      const b = breaks.get(entry.id)
      const waiting = w?.waiting === 'you'
      if (b) {
        if (b.phase !== 'back' && !waiting) goBack(b)
        continue
      }
      if (!waiting || entry.away || entry.state !== 'working' || !entry.seat) continue
      if (!entry.p.seated || entry.p.isBusy() || burning(entry)) continue
      if (used.get(entry.id) === w.since) continue
      if (Date.now() - (Number(w.since) || 0) <= WAIT_MS) continue
      used.set(entry.id, w.since)
      start(entry)
    }
    for (const b of [...breaks.values()]) {
      const entry = b.entry
      if (people.get(entry.id) !== entry || entry.state === 'leaving' || entry.away !== 'coffee-break') {
        drop(b)
        continue
      }
      if (b.phase !== 'back' && entry.state !== 'working') {
        drop(b)
        continue
      }
      if (b.phase !== 'back' && burning(entry)) {
        goBack(b)
        continue
      }
      if (b.phase === 'chat' && b.arrived) chat(b, dt)
    }
  }

  return {
    step(dt) {
      clock += dt
      if (clock < 0.4) return
      const d = clock
      clock = 0
      tick(d)
    },
    label(entry) {
      const b = breaks.get(entry.id)
      if (!b || entry.away !== 'coffee-break' || b.phase === 'back' || b.phase === 'standing') return
      const partner = b.arrived ? partnerOf(b) : null
      if (!partner) return 'On a coffee break'
      let name = partner.entry.persona.name
      if (name === entry.persona.name && partner.entry.info?.sessionName) name += ` · ${partner.entry.info.sessionName}`
      return `Chatting with ${name}`
    },
    gone(entry) {
      const b = breaks.get(entry.id)
      if (b) drop(b)
      used.delete(entry.id)
    },
  }
}
