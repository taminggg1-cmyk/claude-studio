// Who works for whom, made visible. When an agent arrives, it first walks to its lead's desk and is briefed: the lead
// hands over the task, the agent says it is on it, and only then does the agent go to its own desk. When an agent
// finishes, it walks back to its lead's desk, leaves a folder on it ("Report's on your desk!"), gets a thank you, and
// then heads out. Each folder fades away 30 seconds after it was left. Stopped or failed agents leave as before.
//
// Demo: add ?briefing to ?demo or ?sessions. The demos retire their helpers without marking them done, so with this
// switch most retiring helpers are treated as finished and hand in a report.

const REPORT_LIFE = 30
const FADE = 3
const WORDS_BACK = ['On it!', 'Got it!', 'Right away!', 'Sure thing!', 'Leave it with me!', 'Will do!']
const FOLDER_COLOURS = [0xd9a066, 0x9fb8a0, 0xc98b78, 0x93a9c4, 0xe3c27a]

const pick = list => list[Math.floor(Math.random() * list.length)]
const clip = (text, n) => (text.length <= n ? text : text.slice(0, n - 1).trimEnd() + '…')

export function makeBriefing(ctx) {
  const { THREE, scene, ROOM, aisleZ, v3, people, params } = ctx
  const demo = ctx.isDemo && params.has('briefing')
  let now = 0
  /** lead id -> the folders on that lead's desk, oldest first. */
  const piles = new Map()
  /** lead id -> when each person now standing at that desk is done (simulation time), so two do not stand together. */
  const standing = new Map()
  let folderCount = 0

  const folderGeo = new THREE.BoxGeometry(0.2, 0.012, 0.14)
  const paperGeo = new THREE.BoxGeometry(0.18, 0.005, 0.12)

  const alive = lead => !!lead && people.get(lead.id) === lead && lead.state === 'working' && !!lead.seat
  const burning = entry => ctx.chaos.state().some(f => !f.out && f.id === entry.id)
  /** The lead can be briefed or handed a report: seated at their desk, working, nothing else going on, no fire. */
  const available = lead => alive(lead) && lead.p.seated && !lead.away && !burning(lead)

  /** Where someone stands beside a lead's desk, and the lane (the walkway at the desk's end) they reach it along. */
  function spot(lead) {
    const seat = lead.seat
    const list = (standing.get(lead.id) ?? []).filter(until => until > now)
    const out = seat.z < seat.pod.z ? -1 : 1
    const laneX = seat.approach.x
    const z = Math.max(ROOM.z0 + 0.7, Math.min(ROOM.z1 - 0.7, seat.z + out * (0.8 + 0.55 * list.length)))
    const x = Math.max(ROOM.x0 + 0.7, Math.min(ROOM.x1 - 0.7, seat.x - seat.face * 0.25))
    return { stand: v3(x, z), lane: v3(laneX, z), laneAisle: v3(laneX, aisleZ), list }
  }

  const reserve = (lead, s, secs) => {
    s.list.push(now + secs)
    standing.set(lead.id, s.list)
  }

  /** The yaw that faces the lead's seat from where someone stands. */
  const facing = (s, lead) => Math.atan2(lead.seat.x - s.stand.x, lead.seat.z - s.stand.z)

  // ---------------------------------------------------------------- the folders

  function addFolder(lead) {
    const seat = lead.seat
    const list = piles.get(lead.id) ?? []
    piles.set(lead.id, list)
    const body = new THREE.MeshStandardMaterial({ color: FOLDER_COLOURS[folderCount++ % FOLDER_COLOURS.length], roughness: 0.8, transparent: true })
    const paper = new THREE.MeshStandardMaterial({ color: 0xfbf6ee, roughness: 0.9, transparent: true })
    const g = new THREE.Group()
    const a = new THREE.Mesh(folderGeo, body)
    const b = new THREE.Mesh(paperGeo, paper)
    b.position.y = 0.0085
    for (const m of [a, b]) {
      m.castShadow = true
      m.receiveShadow = true
      g.add(m)
    }
    g.rotation.y = (Math.random() - 0.5) * 0.7
    // the free strip of the desk on the sitter's side, clear of the screen, lamp, plant and mug
    g.userData.base = new THREE.Vector3(seat.desk.x - seat.face * 0.26 + (Math.random() - 0.5) * 0.04, seat.desk.y, seat.desk.z + (Math.random() - 0.5) * 0.06)
    g.position.copy(g.userData.base)
    g.scale.setScalar(0.01)
    scene.add(g)
    list.push({ g, body, paper, age: 0 })
  }

  function dropItem(item) {
    scene.remove(item.g)
    item.body.dispose()
    item.paper.dispose()
  }

  function tidy(dt) {
    for (const [id, list] of piles) {
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i]
        item.age += dt
        if (item.age >= REPORT_LIFE) {
          dropItem(item)
          list.splice(i, 1)
        }
      }
      if (!list.length) piles.delete(id)
      // the pile settles as folders go: each sits on the ones under it
      list.forEach((item, i) => {
        const pop = Math.min(1, item.age / 0.3)
        const fade = Math.min(1, (REPORT_LIFE - item.age) / FADE)
        const target = item.g.userData.base.y + i * 0.0145
        item.g.position.y = target
        item.g.scale.setScalar(Math.max(0.01, 1 - (1 - pop) * (1 - pop)))
        item.body.opacity = item.paper.opacity = Math.max(0, fade)
      })
    }
  }

  // ---------------------------------------------------------------- the two walks

  /** Whether the person is an agent that finished its work (not one that was stopped or failed). */
  function finished(entry) {
    const info = entry.info ?? {}
    if (info.label === 'Done' || /\bdone\b/i.test(String(info.activity ?? ''))) return true
    // the demos never mark a helper done, so with ?briefing most of those that retire count as finished
    return demo && Math.random() < 0.8
  }

  function arrive(entry, from) {
    if (entry.isLead || !entry.p || !entry.seat) return
    const lead = ctx.leadOf(entry)
    if (!lead || lead === entry || !available(lead) || burning(entry)) return
    const s = spot(lead)
    const { p } = entry
    const task = clip(String(entry.info?.task ?? '').replace(/\s+/g, ' ').trim(), 30)
    const ask = task ? `Could you take this? ${task}` : 'Could you take this one?'
    reserve(lead, s, 12)
    const stillThere = () => alive(lead) && !lead.away && entry.state === 'entering'
    p.walk([...from, s.laneAisle, s.lane, s.stand])
      .turn(facing(s, lead), 0.3)
      .call(() => {
        if (entry.state === 'entering') entry.briefing = true
        if (stillThere()) ctx.sayText(lead, ask)
      })
      .wait(1.5)
      .call(() => {
        if (stillThere()) ctx.sayText(entry, pick(WORDS_BACK))
      })
      .wait(1.1)
      .walk([s.lane])
      .call(() => (entry.briefing = false))
    return [s.laneAisle]
  }

  function depart(entry, from) {
    if (entry.isLead || !entry.p || entry.away || !finished(entry)) return
    const lead = ctx.leadOf(entry)
    if (!lead || lead === entry || !available(lead)) return
    const s = spot(lead)
    const { p } = entry
    reserve(lead, s, 12)
    const here = () => alive(lead) && !lead.away
    p.walk([...from, s.laneAisle, s.lane, s.stand])
      .turn(facing(s, lead), 0.3)
      .call(() => {
        entry.reporting = true
        if (!here()) return
        addFolder(lead)
        ctx.sayText(entry, "Report's on your desk!")
      })
      .wait(0.9)
      .call(() => {
        if (here()) ctx.sayText(lead, 'Thanks!')
      })
      .wait(1.5)
      .walk([s.lane])
      .call(() => (entry.reporting = false))
    return [s.laneAisle]
  }

  return {
    step(dt) {
      now += dt
      tidy(dt)
      for (const entry of people.values()) {
        if (entry.briefing && entry.state !== 'entering') entry.briefing = false
        if (entry.reporting && entry.state !== 'leaving') entry.reporting = false
      }
    },
    arrive,
    depart,
    label(entry) {
      if (entry.briefing && entry.state === 'entering') return 'Getting briefed'
      if (entry.reporting && entry.state === 'leaving') return 'Handing in a report'
    },
    gone(entry) {
      for (const item of piles.get(entry.id) ?? []) dropItem(item)
      piles.delete(entry.id)
      standing.delete(entry.id)
      entry.briefing = entry.reporting = false
    },
  }
}
