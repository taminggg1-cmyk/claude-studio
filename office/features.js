// The office's feature modules. Each feature lives in its own file under ./features/ and adds one thing to the room
// without editing the core page: it gets a context (`ctx`, below) when the page starts and answers any of these hooks.
// Every hook is optional, and a hook that throws is skipped (with a warning in the console), so one feature can never
// break the room.
//
//   apply(snapshot, sessions)  after every update from the server, once the people are in place. `snapshot` is what
//                              the server sent ({ sessions, stats }); `sessions` is its list of sessions, each
//                              { id, name, cwd, joined, changed, state }, where state.extras[<feature>] holds what the
//                              mod's matching feature sends (see hooks/features/kit.ts).
//   step(dt, t)                every simulation step (dt in seconds, t the simulation time).
//   arrive(entry, from)        a person is about to walk from the door to their desk along the points `from`. Queue
//                              any steps of your own on entry.p first (walk somewhere, stop, talk) and return the points
//                              the walk to the desk should start from; return nothing to leave the walk as it is.
//   depart(entry, from)        the same when a person has stood up from their desk and is about to walk to the door.
//   label(entry, label)        the words on a person's badge; return new words to change them, nothing to keep them.
//   gone(entry)                the person has left the room (their figure is gone); drop anything kept for them.
//   click(hit)                 the person clicked the room (not a drag). hit = { x, y, ray (a THREE.Raycaster from
//                              the camera through the pointer), person (the person under the pointer, if any) }.
//                              Return true when your feature took the click (the core then does not open the
//                              person's card); return nothing to let it through.
//   hover(hit)                 the pointer moved over the room (not dragging); same hit. Return a CSS cursor (e.g.
//                              'pointer') when something of yours is under it; the first feature that answers wins.
//   keep(entry)                a person is about to leave (their agent or session ended). Return true to keep them in
//                              the room off duty: they still walk their way out of their desk (and any `depart` route),
//                              but then stay, and offDuty(entry) follows. The first feature that answers true wins.
//   offDuty(entry)             a kept person is now off duty: entry.friend is true, entry.state is 'off', their id is
//                              a new 'friend:N' one and they have no desk. Plan what they do from here.
//   hire(entry, from)          someone off duty is starting work (a new agent or lead wears their character): drop any
//                              plans for them, queue getting up on entry.p, and return the points their walk to the
//                              desk should start from (like arrive). Their id changes right after.
//
// People off duty (entry.friend) belong to the feature that keeps them (the lounge): they have no desk and no session,
// the server's updates never send them away, and the core does not pose them (set entry.p.activity yourself). The one
// with entry.nextUp set is the next a new agent wears (else one at random), and their name tag says "next up".
// ctx.addFriend({ model }) brings a new one into the room (just outside the door, or `at` a spot), ctx.leave(entry)
// sends one out of the door from where they stand.
//
// ctx.env is shared lighting a feature may change: env.sun and env.sky scale the sunlight and the sky light (1 = as the
// clock says; weather lowers them on a grey day). The panel (the "+ Ask the office" card) is ../panel.js: import
// addTab/ask/canSend from it to add a tab of your own or to send the server a request with the page key.
//
// A person (`entry`, from ctx.people) has: id, isLead, info (their worker from the mod, plus session, sessionName and,
// for an agent, lead: the id of their session's lead), persona, p (the actor: p.walk(points), p.turn(yaw, secs),
// p.step(point, secs), p.sit(), p.stand(), p.wait(secs), p.call(fn), p.until(test, secs), p.clear(); p.root is the
// figure, p.seated whether they sit), seat (their desk: seat.x/z, seat.desk, seat.approach, seat.face, seat.pod) and
// state ('entering', 'working', 'waiting', 'leaving', 'panic', 'firefighting', 'returning'). A feature that walks a
// seated person away from their desk sets entry.away to its own name and brings them back (p.walk to
// seat.approach, then ctx.sitDown(entry)); while entry.away is set, leaving the room walks them straight out from
// where they are.

import { makeYourTurn } from './features/your-turn.js'
import { makeWhiteboard } from './features/whiteboard.js'
import { makeBriefing } from './features/briefing.js'
import { makeProgress } from './features/progress.js'
import { makeCoffeeBreak } from './features/coffee-break.js'
import { makePaperwork } from './features/paperwork.js'
import { makeShiftReport } from './features/shift-report.js'
import { makeControl } from './features/control.js'
import { makeDecorate } from './features/decorate.js'
import { makeInteract } from './features/interact.js'
import { makeWeather } from './features/weather.js'
import { makeCharacters } from './features/characters.js'
import { makeMailroom } from './features/mailroom.js'
import { makeLounge } from './features/lounge.js'
import { makeTv } from './features/tv.js'
import { makeSound } from './features/sound.js'
import { makeJobs } from './features/jobs.js'
import { makeStatusStrip } from './features/status-strip.js'
import { makeStations } from './features/stations.js'
import { makeGadgets } from './features/gadgets.js'
import { makeStandup } from './features/standup.js'
import { makeUsageTag } from './features/usage-tag.js'

const MAKERS = {
  'your-turn': makeYourTurn,
  whiteboard: makeWhiteboard,
  briefing: makeBriefing,
  progress: makeProgress,
  'coffee-break': makeCoffeeBreak,
  paperwork: makePaperwork,
  'shift-report': makeShiftReport,
  control: makeControl,
  decorate: makeDecorate,
  interact: makeInteract,
  weather: makeWeather,
  characters: makeCharacters,
  mailroom: makeMailroom,
  lounge: makeLounge,
  tv: makeTv,
  sound: makeSound,
  jobs: makeJobs,
  'status-strip': makeStatusStrip,
  stations: makeStations,
  gadgets: makeGadgets,
  standup: makeStandup,
  'usage-tag': makeUsageTag,
}

export function makeFeatures(ctx) {
  const list = []
  for (const [name, make] of Object.entries(MAKERS)) {
    try {
      const f = make(ctx)
      if (f) list.push({ name, ...f })
    } catch (err) {
      console.warn(`studio: the ${name} feature did not start:`, err)
    }
  }
  const quiet = new Set()
  const run = (f, hook, args) => {
    try {
      return f[hook]?.(...args)
    } catch (err) {
      const key = `${f.name}.${hook}`
      if (!quiet.has(key)) console.warn(`studio: ${key} failed:`, err)
      quiet.add(key)
      return undefined
    }
  }
  const each = hook => (...args) => {
    for (const f of list) run(f, hook, args)
  }
  const chain = hook => (entry, value) => {
    for (const f of list) {
      const next = run(f, hook, [entry, value])
      if (next !== undefined && next !== null) value = next
    }
    return value
  }
  return {
    list,
    apply: each('apply'),
    step: each('step'),
    gone: each('gone'),
    arrive: chain('arrive'),
    depart: chain('depart'),
    label: chain('label'),
    hire: chain('hire'),
    offDuty: each('offDuty'),
    /** True when a feature keeps a leaving person in the room, off duty. */
    keep(entry) {
      for (const f of list) if (run(f, 'keep', [entry]) === true) return true
      return false
    },
    /** True when a feature took the click. */
    click(hit) {
      for (const f of list) if (run(f, 'click', [hit]) === true) return true
      return false
    },
    /** The cursor the first answering feature wants, or ''. */
    hover(hit) {
      for (const f of list) {
        const cursor = run(f, 'hover', [hit])
        if (typeof cursor === 'string' && cursor) return cursor
      }
      return ''
    },
  }
}
