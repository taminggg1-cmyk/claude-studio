// The lounge: the characters who are not working hang out here, off duty, so Claude is never alone in the office.
// They sit on the sofas (resting, reading, watching TV, now and then dozing off), fetch a coffee and drink it at the
// bistro table, play the arcade cabinet once it is unlocked, and chat with each other. Every one to three minutes one of
// them walks over to Claude's desk, says hello and goes back; when Claude is busy those visits are rarer and quieter.
//
// Who is here is the person's choice: the "Lounge" button on each agent in the Characters tab (models.json's "lounge"
// list; until someone chooses, the first three agents). Without character models, three built-in figures hang out.
// Who goes to work is random, unless the person clicks someone in the lounge and presses "Next to work": that one
// (entry.nextUp, name tag "next up") goes to the next agent Claude starts, and then it is random again. A character
// picked in the panel's "Add an agent" tab still wins.
//
// When Claude starts an agent, the office dresses it in a lounging character first (see modelFor in ../office.js):
// that person gets up from the sofa and walks to a desk (the `hire` hook). When the agent is done, a character on the
// list walks back to the lounge instead of out of the door (`keep`, then `offDuty`). People off duty wear only their
// name tag, marked "off duty", so the status pills in the room are always the people really working.
//
// Demo: ?still=0&lounge (Claude alone with the lounge), ?demo&lounge (agents come and go: watch them get up),
// ?lounge=5 for five built-in figures with ?models=0.

import { pickLine } from '../persona.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = list => list[Math.floor(Math.random() * list.length)]
const P = (x, z) => ({ x, z })
const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z)

/** How many built-in figures hang out when there are no character models. */
const BUILT_INS = 3
/** How much higher each sofa's seat is than a desk chair's (0.33; the figures sit at a chair's height). */
const SINK = { curved: -0.05, straight: 0.03, side: 0.03 }

const VISIT = ['How is it going, {name}?', 'Need a hand with anything?', 'Want me to bring you a coffee?', 'The sofa misses you, {name}.', 'Any work for me today?', 'Just checking on you!']
const QUIET = ["Don't mind me.", 'You look busy. Later!', 'Go get them, {name}.', 'Just passing by.']
const MISSED = ['Oh, out on a break.', 'Not at the desk? Never mind.']
const REPLY = ['All good, thank you!', 'Nice of you to drop by.', 'Coffee sounds lovely.', 'I might call you in soon!', 'Thanks, I am doing fine.']
const BYE = ['See you in a bit!', 'Back to the sofa.', 'Shout if you need me.']
const CHAT = ['Nice and quiet today.', 'This sofa is the best.', 'Did you see the cat?', 'Any work coming our way?', 'I could nap here all day.', 'Who wants a coffee?']
const REPLIES = ['Ha, same here.', 'Mm, true.', 'Right?', 'I know what you mean.', 'Shh, the cat is asleep.']
const ON_MY_WAY = ['On my way!', 'Work? I am in.', 'Coming!', 'Finally, a task!']
const PICKED = ['Me next? Okay!', 'I will be ready.', 'Sure, I am next!', 'Count me in.']

const CSS = `
.lg-card { position: fixed; z-index: 47; width: 236px; background: var(--card); color: var(--ink); border: 1px solid var(--card-line);
  border-radius: 14px; padding: 10px 12px 11px; box-shadow: var(--shadow); font: 13px/1.4 "Segoe UI", sans-serif; backdrop-filter: blur(8px); }
.lg-card .lg-head { display: flex; align-items: baseline; gap: 7px; font-weight: 700; }
.lg-card .lg-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; align-self: center; }
.lg-card .lg-off { font-weight: 600; font-style: italic; font-size: 11px; color: var(--muted); }
.lg-card .lg-x { margin-left: auto; border: 0; background: none; color: var(--muted); font-size: 15px; cursor: pointer; padding: 0 2px; }
.lg-card p { margin: 6px 0 0; font-size: 12px; }
.lg-card .lg-note { color: var(--muted); font-size: 11px; }
.lg-card .lg-go { margin-top: 9px; border: 0; border-radius: 999px; padding: 6px 14px; font: 700 12px "Segoe UI", sans-serif;
  background: #c8775a; color: #fff; cursor: pointer; }
.lg-card .lg-go.plain { background: transparent; color: var(--ink); border: 1px solid var(--card-line); }
`

export function makeLounge(ctx) {
  const { THREE, people, world, aisleZ, v3, params, scene, sayText } = ctx
  if (ctx.isDemo && !params.has('lounge')) return null
  /** ?lounge (on a demo page, or a live window for checking) makes everything happen sooner. */
  const quick = params.has('lounge')
  const models = ctx.models
  const useModels = !!models?.agents.length
  const builtIns = Math.max(0, Math.min(8, Number(params.get('lounge')) || BUILT_INS))

  /** The Characters list from the server (live pages): who the person put in the lounge. */
  let rows = null
  /** entry -> what that person off duty is up to. */
  const friends = new Map()
  /** People leaving their desk whom the lounge keeps (they become friends once they are out of their desk). */
  const kept = new Set()
  /**
   * Without character models: everyone who belongs to the lounge, off duty or called to work (a built-in figure has
   * nothing else to tell them apart). With models, the model files on the list do that.
   */
  const crew = new Set()
  const crewSize = () => [...crew].filter(e => people.get(e.id) === e).length
  /** Room spots someone off duty has claimed (counter, table, arcade), by key. */
  const held = new Map()
  /** Lines to say a moment from now: { at, entry, text }. */
  const later = []
  let synced = false
  let clock = 0
  let now = 0
  let visitIn = quick ? rnd(6, 10) : rnd(60, 180)
  let chatIn = quick ? rnd(5, 9) : rnd(25, 50)
  let homeCheck = 0

  // ------------------------------------------------------------------------------------------------ "next to work"

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  let card = null

  function closeCard() {
    card?.el.remove()
    card = null
  }

  /** Marks one person off duty as the next to go to work (or nobody, with null). */
  function setNext(entry) {
    for (const f of friends.values()) f.entry.nextUp = f.entry === entry
  }

  /** The little card for someone off duty: who they are, and the "Next to work" button. */
  function openCard(f, x, y) {
    closeCard()
    const { entry } = f
    const el = document.createElement('div')
    el.className = 'lg-card'
    const head = document.createElement('div')
    head.className = 'lg-head'
    const dot = document.createElement('span')
    dot.className = 'lg-dot'
    dot.style.background = entry.persona.color
    const name = document.createElement('span')
    name.textContent = entry.persona.name
    const off = document.createElement('span')
    off.className = 'lg-off'
    off.textContent = entry.nextUp ? 'next up' : 'off duty'
    const x0 = document.createElement('button')
    x0.className = 'lg-x'
    x0.type = 'button'
    x0.title = 'Close'
    x0.textContent = '×'
    x0.onclick = closeCard
    head.append(dot, name, off, x0)
    el.append(head)
    if (entry.persona.about) {
      const about = document.createElement('p')
      about.textContent = entry.persona.about
      el.append(about)
    }
    const note = document.createElement('p')
    note.className = 'lg-note'
    note.textContent = entry.nextUp
      ? 'Goes to the next agent Claude starts. After that it is random again.'
      : 'Off duty in the lounge. Pick them, and they go to the next agent Claude starts.'
    const go = document.createElement('button')
    go.type = 'button'
    go.className = entry.nextUp ? 'lg-go plain' : 'lg-go'
    go.textContent = entry.nextUp ? 'Not next' : 'Next to work'
    go.onclick = () => {
      if (friends.get(entry) !== f) return closeCard()
      if (entry.nextUp) setNext(null)
      else {
        setNext(entry)
        sayText(entry, pick(PICKED))
      }
      closeCard()
    }
    el.append(note, go)
    document.body.append(el)
    // beside the pointer, kept inside the window
    const w = el.offsetWidth
    const h = el.offsetHeight
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x + 14))}px`
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y - h / 2))}px`
    card = { el, f }
  }
  window.addEventListener('keydown', e => e.key === 'Escape' && closeCard())

  // ------------------------------------------------------------------------------------------------ places

  const R = P(-2.85, 2.1) // into the lounge past the main sofa's right end
  const L = P(-7.55, 2.2) // into the lounge between the side sofa and the main one
  const TABLE = P(-4.9, 4.7)

  /** Seats and standing spots in the lounge, for the sofa the room shows now (the Design tab may swap or hide it). */
  function places() {
    const sofa = world.design?.current?.().variants?.sofa ?? 'curved'
    const list = []
    const add = (key, pos, yaw, y, front, exit, gate, sit = true) => list.push({ key, pos, yaw, y, front, exit, gate, sit })
    const mainExit = [P(-3.45, 4.3), P(-2.85, 3.4), R]
    if (sofa === 'curved') {
      const c = P(-4.9, 4.75)
      for (const [i, a] of [
        [1, 0],
        [0, 0.55],
        [2, -0.55],
      ]) {
        const ang = Math.PI / 2 + a
        const pos = P(c.x + Math.cos(ang) * 1.5, c.z - Math.sin(ang) * 1.5)
        const yaw = yawTo(pos, c)
        add(`curved${i}`, pos, yaw, SINK.curved, P(pos.x + Math.sin(yaw) * 0.45, pos.z + Math.cos(yaw) * 0.45), mainExit, R)
      }
    } else if (sofa === 'straight') {
      for (const [i, dx] of [
        [1, 0],
        [0, -0.66],
        [2, 0.66],
      ])
        add(`straight${i}`, P(-4.9 + dx, 3.5), 0, SINK.straight, P(-4.9 + dx, 3.98), mainExit, R)
    }
    // the low sofa along the left wall (the cat's favourite end, at z 3.75, stays free)
    for (const [i, z] of [
      [0, 4.45],
      [1, 5.11],
    ])
      add(`side${i}`, P(-8.43, z), Math.PI / 2, SINK.side, P(-7.95, z), [L], L)
    add('stand0', P(-3.35, 5.55), yawTo(P(-3.35, 5.55), TABLE), 0, P(-3.35, 5.55), [P(-2.85, 3.4), R], R, false)
    add('stand1', P(-6.6, 5.7), yawTo(P(-6.6, 5.7), TABLE), 0, P(-6.6, 5.7), [L], L, false)
    // the order people take them in: spread over both sofas before anyone sits shoulder to shoulder
    const order = ['curved1', 'straight1', 'side1', 'curved0', 'straight0', 'side0', 'curved2', 'straight2', 'stand0', 'stand1']
    return list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  }

  const BISTRO_TABLE = P(-4.7, -3.4)
  const BISTRO = [P(-5.69, -3.76), P(-4.52, -4.43), P(-5.06, -2.41), P(-3.69, -3.1)].map((pos, i) => ({ key: `table${i}`, pos, yaw: yawTo(pos, BISTRO_TABLE) }))
  const COUNTER = [-6.1, -6.85].map((x, i) => ({ key: `counter${i}`, pos: P(x, -5.75), yaw: Math.PI }))
  /** Where someone stands when every lounge spot is taken: by the bistro table. */
  const overflow = () => BISTRO.map(b => ({ ...b, front: b.pos, exit: [], gate: null, sit: false, y: 0, overflow: true }))

  let arcadeObj
  let arcadeLook = 0
  /** The arcade cabinet's playing spot, when it stands in the room (it is unlocked by passing tests). */
  function arcade() {
    if (arcadeObj === undefined || (!arcadeObj && now - arcadeLook > 60)) {
      arcadeLook = now
      arcadeObj = null
      scene.traverse(o => {
        if (o.userData?.clickable === 'arcade') arcadeObj = o
      })
    }
    return arcadeObj?.visible ? { key: 'arcade', pos: P(-7.72, -5.2), yaw: -Math.PI / 2 } : null
  }

  const V = pts => pts.map(q => v3(q.x, q.z))
  const at = f => f.entry.p.root.position
  const inLounge = pos => pos.x < -1.0 && pos.z > 1.95
  /** From the aisle to a place's front. */
  const routeIn = h => (h.gate ? [P(h.gate.x, aisleZ), ...[...h.exit].reverse(), h.front] : [P(h.pos.x, aisleZ), h.front])
  /** From a place's front to the aisle. */
  const routeOut = h => (h.gate ? [...h.exit, P(h.gate.x, aisleZ)] : [P(h.pos.x, aisleZ)])

  /** Nobody else stands or sits within half a metre of `pos`. */
  function clear(pos, self) {
    for (const e of people.values()) {
      if (e === self || !e.p.root.visible) continue
      const q = e.p.root.position
      if (Math.hypot(q.x - pos.x, q.z - pos.z) < 0.5) return false
    }
    return true
  }

  function freeHome(self) {
    const mine = new Set([...friends.values()].filter(f => f.entry !== self && f.home).map(f => f.home.key))
    return [...places(), ...overflow()].find(h => !mine.has(h.key) && !held.has(h.key) && clear(h.front, self)) ?? null
  }

  // ------------------------------------------------------------------------------------------------ the roster

  /** Who should be in the lounge: model files (in the person's order), or null for the built-in figures. */
  function roster() {
    if (!useModels) return null
    const agents = new Set(models.agents)
    // the server's list, when that server knows about the lounge (an office server started before this feature sends
    // its rows without a `lounge` field: then models.json, as this page read it, decides)
    const live = rows && rows.some(r => r && typeof r.lounge === 'boolean')
    const list = live ? rows.filter(r => r && r.role === 'agent' && r.lounge).map(r => r.file) : models.lounge ?? []
    return list.filter(f => agents.has(f))
  }

  /** Someone already wears `model`: a friend, a worker at a desk, or a leaving worker the lounge keeps. */
  function worn(model) {
    for (const e of people.values()) {
      if (e.model !== model) continue
      if (e.friend ? friends.has(e) : e.state !== 'leaving' || kept.has(e)) return true
    }
    return false
  }

  function sync() {
    const first = !synced
    synced = true
    const want = roster()
    if (want) {
      for (const f of [...friends.values()]) {
        const m = f.entry.model
        // off the list, or a worker now wears the same character (picked for an agent in the panel)
        if (!want.includes(m) || [...people.values()].some(e => !e.friend && e.state !== 'leaving' && e.model === m)) dismiss(f)
      }
      for (const model of want) if (!worn(model)) add(model, first)
    } else {
      for (let i = crewSize(); i < builtIns; i++) add(null, first)
      const list = [...friends.values()]
      let extra = crewSize() - builtIns
      while (extra-- > 0 && list.length) dismiss(list.pop())
    }
  }

  // ------------------------------------------------------------------------------------------------ moving about

  function record(entry, home) {
    const f = { entry, home, sitting: false, doing: 'walking', until: 0, holds: [], last: '' }
    friends.set(entry, f)
    if (!useModels) crew.add(entry)
    return f
  }

  function add(model, instant) {
    const home = freeHome(null)
    if (instant && home) {
      const entry = ctx.addFriend({ model, at: v3(home.sit ? home.pos.x : home.front.x, home.sit ? home.pos.z : home.front.z), yaw: home.yaw })
      const f = record(entry, home)
      if (home.sit) {
        entry.p.root.position.y = home.y
        entry.p.seated = true
        f.sitting = true
      }
      settle(f)
      return
    }
    const entry = ctx.addFriend({ model })
    const f = record(entry, home)
    entry.p.walk([world.doorway.inside])
    comeHome(f)
  }

  /** Lets go of the room spots they claimed. */
  function release(f) {
    for (const key of f.holds) if (held.get(key) === f) held.delete(key)
    f.holds = []
  }
  function claim(f, key) {
    held.set(key, f)
    f.holds.push(key)
  }

  /** Queues getting up from their seat and stepping out in front of it. */
  function standUp(f) {
    const { p } = f.entry
    if (!f.sitting) return
    const h = f.home
    p.call(() => (p.activity = 'idle'))
      .stand()
      .step(v3(h.front.x, h.front.z), 0.5)
      .call(() => (f.sitting = false))
  }

  /** Queues getting up and walking out to the aisle. */
  function leaveHome(f) {
    const { p } = f.entry
    standUp(f)
    if (f.home) p.walk(V(routeOut(f.home)))
  }

  /** Queues the walk back to their own place (from wherever they will be by then) and sitting down. */
  function comeHome(f) {
    const { p } = f.entry
    f.doing = 'walking'
    p.call(() => {
      if (friends.get(f.entry) !== f) return
      const h = f.home ?? (f.home = freeHome(f.entry))
      if (!h) return settle(f)
      const pos = p.root.position
      const route = inLounge(pos) && h.gate ? [h.front] : [P(pos.x, aisleZ), ...routeIn(h)]
      p.walk(V(route))
        .call(() => p.hold(null))
        .turn(h.yaw, 0.3)
      if (h.sit)
        p.call(() => (f.sitting = true))
          .step(new THREE.Vector3(h.pos.x, h.y, h.pos.z), 0.55)
          .sit()
      p.call(() => settle(f))
    })
  }

  /** At their place: a new pose, and when to think about doing something else. */
  function settle(f) {
    f.doing = 'home'
    f.until = now + (quick ? rnd(10, 20) : rnd(40, 120))
    const { p } = f.entry
    p.hold(null)
    p.lookAt = null
    f.entry.info.mood = 'calm'
    if (!f.sitting) return void (p.activity = 'idle')
    // on a seat that faces the TV they may watch it (features/tv.js says how likely: more so when it is on already)
    const tv = world.tv
    const watch = f.home && tv?.watchChance ? tv.watchChance(f.home.pos, f.home.yaw) : 0
    if (Math.random() < watch) {
      p.activity = 'watch'
      p.lookAt = tv.at
      return
    }
    const night = document.body.classList.contains('night')
    const r = Math.random()
    p.activity = r < (night ? 0.5 : 0.22) ? 'nap' : r < 0.6 ? 'read' : 'idle'
  }

  function nextThing(f) {
    const r = Math.random()
    const game = arcade()
    if (r < 0.3) return coffee(f)
    if (game && r < 0.45 && !held.has(game.key) && clear(game.pos, f.entry)) return play(f, game)
    settle(f)
  }

  function coffee(f) {
    const slot = COUNTER.find(c => !held.has(c.key) && clear(c.pos, f.entry))
    if (!slot) return settle(f)
    const table = BISTRO.filter(b => !held.has(b.key) && clear(b.pos, f.entry) && b.key !== f.home?.key)
    const spot = table.length ? pick(table) : null
    claim(f, slot.key)
    if (spot) claim(f, spot.key)
    f.doing = 'walking'
    const { p } = f.entry
    leaveHome(f)
    p.walk(V([P(slot.pos.x, aisleZ), slot.pos]))
      .turn(slot.yaw, 0.3)
      .wait(1.6)
      .call(() => p.hold('cup'))
      .wait(0.4)
      .call(() => held.get(slot.key) === f && held.delete(slot.key))
    if (!spot) return comeHome(f)
    p.walk(V([spot.pos]))
      .turn(spot.yaw, 0.4)
      .call(() => {
        f.doing = 'sipping'
        f.until = now + (quick ? rnd(8, 14) : rnd(15, 30))
      })
  }

  function play(f, game) {
    claim(f, game.key)
    f.doing = 'walking'
    const { p } = f.entry
    leaveHome(f)
    p.walk(V([P(game.pos.x, aisleZ), game.pos]))
      .turn(game.yaw, 0.3)
      .call(() => {
        f.entry.info.mood = 'flow' // bopping along, with music notes
        f.doing = 'playing'
        f.until = now + (quick ? rnd(8, 14) : rnd(20, 35))
      })
  }

  /** Sends someone off duty out of the door (they are no longer on the list). */
  function dismiss(f) {
    const { entry } = f
    friends.delete(entry)
    crew.delete(entry)
    release(f)
    forget(entry)
    entry.nextUp = false
    if (card?.f === f) closeCard()
    const { p } = entry
    p.clear()
    p.hold(null)
    entry.info.mood = 'calm'
    entry.state = 'going' // not 'off': nobody hires them on their way out
    const pos = p.root.position
    if (f.sitting) standUp(f)
    if (f.home?.gate && (f.sitting || inLounge(pos))) p.walk(V(routeOut(f.home)))
    p.call(() => ctx.leave(entry))
  }

  // ------------------------------------------------------------------------------------------------ talking

  const here = e => !!e && people.get(e.id) === e && e.state !== 'leaving'
  function sayLater(seconds, entry, text) {
    later.push({ at: now + seconds, entry, text })
  }
  /** Drops the lines someone was still going to say (they were called to work, or are leaving). */
  function forget(entry) {
    for (let i = later.length - 1; i >= 0; i--) if (later[i].entry === entry) later.splice(i, 1)
  }
  const nameIn = (line, lead) => line.replace('{name}', lead?.persona.name ?? 'Claude')
  /** A line from someone's own persona for idle moments now and then, else one of `pool`. */
  function lineFor(entry, pool, chance = 0.4) {
    if (entry.persona.own && Math.random() < chance) {
      const own = pickLine(entry.persona, 'idle', entry.voice?.last)
      if (own) return own
    }
    return pick(pool)
  }

  /** Leads sitting at their desks, who could take a visit. */
  function leads() {
    return [...people.values()].filter(e => e.isLead && !e.friend && e.state === 'working' && e.seat && e.p.seated && !e.away)
  }
  const resting = lead => lead.info?.code === 'idle'

  function visit(f, lead) {
    const seat = lead.seat
    const stand = [P(seat.approach.x, seat.approach.z + 0.6), P(seat.approach.x, seat.approach.z - 0.6)].find(s => clear(s, f.entry))
    if (!stand) return false
    const quiet = !resting(lead)
    f.doing = 'visit'
    const { p } = f.entry
    leaveHome(f)
    p.walk(V([P(stand.x, aisleZ), stand]))
      .turn(yawTo(stand, lead.p.root.position), 0.35)
      .call(() => {
        if (!(here(lead) && lead.p.seated && !lead.away)) return sayText(f.entry, pick(MISSED))
        if (quiet) return sayText(f.entry, nameIn(pick(QUIET), lead))
        sayText(f.entry, nameIn(pick(VISIT), lead))
        sayLater(3.2, lead, lineFor(lead, REPLY, 0.35))
        sayLater(6.6, f.entry, pick(BYE))
      })
      .wait(quiet ? 2.4 : 7.2)
      .call(() => (p.action = 'wave'))
      .wait(1.3)
      .call(() => p.action === 'wave' && (p.action = null))
    comeHome(f)
    return true
  }

  /** Two people off duty near each other trade a line. */
  function chat() {
    const idle = [...friends.values()].filter(f => (f.doing === 'home' || f.doing === 'sipping') && !f.entry.p.isBusy() && f.entry.p.activity !== 'nap' && f.entry.voice.left <= 0)
    for (const a of idle.sort(() => Math.random() - 0.5))
      for (const b of idle) {
        if (a === b) continue
        const pa = at(a)
        const pb = at(b)
        if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > 2.4) continue
        sayText(a.entry, lineFor(a.entry, CHAT))
        sayLater(2.8, b.entry, lineFor(b.entry, REPLIES, 0.25))
        return
      }
  }

  // ------------------------------------------------------------------------------------------------ each step

  function tick(dt) {
    now += dt
    for (const f of [...friends.values()]) {
      if (f.entry.p.isBusy()) continue
      if (f.doing === 'home' && now >= f.until) nextThing(f)
      else if ((f.doing === 'sipping' || f.doing === 'playing') && now >= f.until) {
        f.entry.info.mood = 'calm'
        release(f)
        comeHome(f)
      }
    }
    for (let i = later.length - 1; i >= 0; i--) {
      const l = later[i]
      if (now < l.at) continue
      later.splice(i, 1)
      if (here(l.entry) && !(l.entry.isLead && l.entry.away)) sayText(l.entry, l.text)
    }
    if ((visitIn -= dt) <= 0) {
      visitIn = quick ? rnd(14, 22) : rnd(60, 180)
      const lead = pick(leads())
      // a resting Claude always gets the visit; a busy one only now and then, and a quiet one
      if (lead && (resting(lead) || Math.random() < (quick ? 0.6 : 0.35))) {
        const ready = [...friends.values()].filter(f => f.doing === 'home' && !f.entry.p.isBusy())
        // someone not in the middle of a TV show, if anyone
        const free = ready.filter(f => f.entry.p.activity !== 'watch')
        if (ready.length) visit(pick(free.length ? free : ready), lead)
      }
    }
    if ((chatIn -= dt) <= 0) {
      chatIn = quick ? rnd(8, 14) : rnd(25, 60)
      chat()
    }
    // the Design tab swapped or hid the sofa: whoever sat on it finds a new place
    if ((homeCheck -= dt) <= 0) {
      homeCheck = 2
      const keys = new Set(places().map(h => h.key))
      for (const f of friends.values()) {
        if (f.doing !== 'home' || f.entry.p.isBusy() || !f.home || f.home.overflow || keys.has(f.home.key)) continue
        const old = f.home
        f.home = null
        f.sitting = false
        f.entry.p.seated = false
        f.entry.p.root.position.y = 0
        f.entry.p.walk(V([old.front, ...routeOut(old)]))
        comeHome(f)
      }
    }
  }

  return {
    apply(snapshot) {
      if (Array.isArray(snapshot?.characters?.list)) rows = snapshot.characters.list
      sync()
    },
    step(dt) {
      clock += dt
      if (clock < 0.25) return
      const d = clock
      clock = 0
      tick(d)
    },
    keep(entry) {
      // Claude's own character (and the built-in Claude) never lounges
      if (entry.lookIndex < 0 || (models?.claude && entry.model === models.claude)) return false
      const want = roster()
      let ok
      if (want) ok = !!entry.model && want.includes(entry.model) && ![...people.values()].some(e => e !== entry && e.model === entry.model && ((e.friend && friends.has(e)) || kept.has(e)))
      else ok = !entry.model && (crew.has(entry) || crewSize() < builtIns)
      if (ok) kept.add(entry)
      if (ok && !want) crew.add(entry)
      return ok
    },
    offDuty(entry) {
      kept.delete(entry)
      const want = roster()
      const ok = want ? want.includes(entry.model) : crew.has(entry)
      if (!ok) return dismiss(record(entry, null))
      const f = record(entry, freeHome(entry))
      entry.p.hold(null)
      comeHome(f)
    },
    hire(entry) {
      const f = friends.get(entry)
      if (!f) return undefined
      friends.delete(entry)
      release(f)
      forget(entry)
      if (card?.f === f) closeCard()
      const { p } = entry
      p.clear()
      p.hold(null)
      p.action = null
      p.activity = 'idle'
      sayText(entry, pick(ON_MY_WAY))
      const pos = p.root.position
      const lounging = f.home?.gate && (f.sitting || inLounge(pos))
      if (f.sitting) standUp(f)
      else if (pos.y !== 0) p.step(v3(pos.x, pos.z), 0.3)
      return lounging ? V(routeOut(f.home)) : [v3(pos.x, aisleZ)]
    },
    label(entry) {
      if (kept.has(entry) && entry.state === 'leaving') return 'Off to the lounge'
    },
    click(hit) {
      const f = hit.person ? friends.get(hit.person) : null
      if (!f) {
        closeCard()
        return undefined
      }
      openCard(f, hit.x, hit.y)
      return true // (instead of the person's usual card)
    },
    gone(entry) {
      // (also called when someone only changes id, starting work or going off duty: they are still in the room then)
      if (people.get(entry.id) === entry) return
      crew.delete(entry)
      const f = friends.get(entry)
      if (f) {
        release(f)
        friends.delete(entry)
      }
      kept.delete(entry)
    },
  }
}
