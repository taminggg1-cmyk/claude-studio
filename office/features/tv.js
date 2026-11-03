// The lounge TV: a flat screen on a low console in front of the sofa. People off duty sit down to watch it (the lounge
// decides who, see lounge.js: a seat that faces the screen, and more often once it is on), and in Auto the TV is on
// while anyone watches. Six made-up channels are drawn live on a small canvas: a cooking show, a nature programme, a
// cartoon, a football match, a space documentary and a kitten cam. The picture's colour spills onto the watchers'
// faces, and they react: they laugh when the cartoon blob bonks his head, cheer a goal, gasp at a comet, and now and
// then say something about the show. Every few minutes someone grabs the remote and changes the channel.
//
// The TV faces the sofa, so from the camera you see its back. Click it (or the "On TV" tag over it) for the remote: the
// live picture, the channel buttons, and Auto / On / Off (On keeps it on and draws people to it; Off sends them back to
// their books). The choice is kept in this browser only. Nothing is sent to the server.
//
// Demo: ?still=0&lounge&tv turns it on and gets everyone watching quickly; ?tv=N starts on channel N (1 to 6);
// ?tv=card also opens the remote.

import { seeded } from '../kit.js'

const W = 320
const H = 180
const TAU = Math.PI * 2
const STORE = 'studio-tv-v1'
const MODES = ['auto', 'on', 'off']
const NOTES = {
  auto: 'Auto: the TV is on while someone on the sofa watches it.',
  on: 'On: it stays on, and people off duty sit down to watch it more often.',
  off: 'Off: nobody watches until you turn it back on.',
}

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = list => list[Math.floor(Math.random() * list.length)]
const wrap = (x, n) => ((x % n) + n) % n

const ANY = ['Shh, this is the good part.', 'Is there more popcorn?', 'Ooh, I like this one.', 'Scoot over a bit.']
const ZAP = ["Let's see what else is on.", 'Channel surfing!', 'Mind if I switch?', "What's on the other side?"]
const TV_TIME = ['Ooh, TV time!', "What's on?", 'Scoot over, I want to see.', 'Popcorn, anyone?']
const TURNED_OFF = ['Hey, I was watching that!', 'Aww, it was getting good.', 'Fine, reading time then.']
const NEW_PICK = ['Ooh, good pick.', 'This one is fun.', 'Hey, I was watching that!', 'Oh, I love this one.']

// ------------------------------------------------------------------------------------------------ drawing helpers

function circle(g, x, y, r) {
  g.beginPath()
  g.arc(x, y, r, 0, TAU)
  g.fill()
}
function oval(g, x, y, rx, ry, rot = 0) {
  g.beginPath()
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU)
  g.fill()
}
function box(g, x, y, w, h, r) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fill()
}
function star(g, x, y, r) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath()
  g.fill()
}
/** The show's name in a pill, bottom left. */
function banner(g, text, color) {
  g.font = '700 10px "Segoe UI", sans-serif'
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  const w = g.measureText(text).width + 16
  g.fillStyle = color
  box(g, 8, H - 22, w, 15, 7)
  g.fillStyle = '#fff'
  g.fillText(text, 16, H - 14.5)
}

function drawStatic(g) {
  g.fillStyle = '#2a2a2e'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 700; i++) {
    const v = 40 + Math.floor(Math.random() * 200)
    g.fillStyle = `rgb(${v},${v},${v})`
    g.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 3, 2)
  }
}

function drawOff(g) {
  g.fillStyle = '#15151a'
  g.fillRect(0, 0, W, H)
  const sheen = g.createLinearGradient(0, 0, W, H)
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.07)')
  sheen.addColorStop(0.5, 'rgba(255, 255, 255, 0)')
  g.fillStyle = sheen
  g.fillRect(0, 0, W, H)
  g.fillStyle = 'rgba(255, 255, 255, 0.35)'
  g.font = '600 12px "Segoe UI", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('The TV is off', W / 2, H / 2)
}

// ------------------------------------------------------------------------------------------------ the channels
//
// Each channel: its name, a line for the remote's card, a colour, what watchers say now and then, and what they do
// when something happens on screen (`events`: `all` watchers or just `one` of them laugh, gasp or cheer, and one says
// a line). `draw(g, t, s, emit)` paints the frame for time t (seconds into the channel), with `s` its own state, and
// calls emit(name) when an event happens.

const kitchen = {
  name: 'Cosy Kitchen',
  about: 'A cooking show. Today: pancakes, and the chef flips one every few seconds.',
  color: '#c8775a',
  lines: ['Ooh, pancakes!', 'Now I am hungry.', 'I could make that. Probably.', 'Somebody make us pancakes.', 'Look how fluffy they are.'],
  events: { flip: { one: 'gasp', chance: 0.55, lines: ['Nice flip!', 'Whoa, look at that flip!', "Don't drop it!"] } },
  init: () => ({ flip: -1 }),
  draw(g, t, s, emit) {
    g.fillStyle = '#f6e7d2'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = 'rgba(196, 160, 120, 0.35)'
    g.lineWidth = 1
    g.beginPath()
    for (let x = 0.5; x <= W; x += 20) {
      g.moveTo(x, 0)
      g.lineTo(x, 116)
    }
    for (let y = 0.5; y <= 116; y += 20) {
      g.moveTo(0, y)
      g.lineTo(W, y)
    }
    g.stroke()
    // a shelf of jars
    g.fillStyle = '#b98a63'
    g.fillRect(196, 46, 112, 5)
    for (const [x, w, h, c] of [
      [204, 16, 20, '#9fb39a'],
      [226, 14, 15, '#eab68f'],
      [246, 18, 22, '#f2c9ad'],
      [270, 12, 13, '#9cb0bb'],
      [288, 14, 18, '#c8775a'],
    ]) {
      g.fillStyle = c
      box(g, x, 46 - h, w, h, 3)
    }
    // the chef behind the counter
    const bob = Math.sin(t * 2.2) * 1.5
    g.fillStyle = '#fbf8f2'
    box(g, 34, 84 + bob, 64, 50, 16)
    g.fillStyle = '#c8775a'
    box(g, 50, 96 + bob, 32, 40, 6)
    g.fillStyle = '#f2c9ad'
    circle(g, 66, 66 + bob, 17)
    g.fillStyle = '#ffffff'
    box(g, 53, 36 + bob, 26, 16, 3)
    for (const [x, y] of [
      [56, 38],
      [66, 33],
      [76, 38],
    ])
      circle(g, x, y + bob, 9)
    g.fillStyle = '#3f332c'
    if (t % 3.2 < 0.12) {
      g.fillRect(57, 65 + bob, 6, 1.5)
      g.fillRect(69, 65 + bob, 6, 1.5)
    } else {
      circle(g, 60, 65 + bob, 2)
      circle(g, 72, 65 + bob, 2)
    }
    g.strokeStyle = '#3f332c'
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(66, 70 + bob, 5, 0.15 * Math.PI, 0.85 * Math.PI)
    g.stroke()
    g.fillStyle = 'rgba(232, 120, 110, 0.35)'
    circle(g, 55, 71 + bob, 3.5)
    circle(g, 77, 71 + bob, 3.5)
    // the counter and the hob
    g.fillStyle = '#e2b98c'
    g.fillRect(0, 114, W, 8)
    g.fillStyle = '#c99a6b'
    g.fillRect(0, 122, W, H - 122)
    g.fillStyle = '#3d3532'
    box(g, 150, 110, 124, 8, 3)
    // the pan, and a pancake that flips every seven seconds
    const px = 208
    const py = 104
    const n = Math.floor(t / 7)
    const c = t - n * 7
    let y = py - 3
    let squash = 1
    if (c > 5.5) {
      const u = (c - 5.5) / 1.5
      y -= Math.sin(u * Math.PI) * 60
      squash = Math.cos(u * TAU)
      if (s.flip !== n) {
        s.flip = n
        emit('flip')
      }
    }
    g.fillStyle = '#2b2624'
    oval(g, px, py, 44, 8)
    g.fillRect(px + 40, py - 3, 44, 6)
    g.fillStyle = squash < 0 ? '#d79a4a' : '#ebb866'
    oval(g, px, y, 28, Math.max(0.6, Math.abs(squash) * 6))
    // steam
    g.strokeStyle = '#ffffff'
    g.lineWidth = 3
    g.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.8 + i * 0.33) % 1
      g.globalAlpha = 0.7 * (1 - ph)
      g.beginPath()
      for (let k = 0; k <= 6; k++) {
        const xx = px - 18 + i * 18 + Math.sin(k * 0.9 + t * 3 + i) * 3
        const yy = py - 12 - ph * 30 - k * 5
        if (k) g.lineTo(xx, yy)
        else g.moveTo(xx, yy)
      }
      g.stroke()
    }
    g.globalAlpha = 1
    banner(g, 'COSY KITCHEN', '#c8775a')
  },
}

const nature = {
  name: 'Wild Hills',
  about: 'A nature programme: a slow sunset over the hills, birds flying home, and now and then a fox.',
  color: '#a8766e',
  lines: ['So peaceful.', 'Look at the birds!', 'I want to go there.', 'What a sunset.', 'Nature is amazing.'],
  events: { fox: { one: 'gasp', chance: 0.7, lines: ['A fox!', 'Aww, a little fox.', 'Look, look, a fox!'] } },
  init: () => ({ fox: -1 }),
  draw(g, t, s, emit) {
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#6f6aa8')
    sky.addColorStop(0.5, '#f29a7a')
    sky.addColorStop(0.8, '#ffd59c')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    const sunY = 96 + Math.sin(t * 0.05) * 6
    const glow = g.createRadialGradient(232, sunY, 4, 232, sunY, 60)
    glow.addColorStop(0, 'rgba(255, 244, 214, 0.9)')
    glow.addColorStop(1, 'rgba(255, 244, 214, 0)')
    g.fillStyle = glow
    g.fillRect(150, sunY - 60, 170, 120)
    g.fillStyle = '#fff3d0'
    circle(g, 232, sunY, 20)
    // three layers of hills, the nearer ones sliding by faster
    const hill = (x, base, amp, f, speed) => base + Math.sin((x + t * speed) * f) * amp + Math.sin((x + t * speed) * f * 2.3 + 1) * amp * 0.4
    for (const [base, amp, f, speed, col] of [
      [112, 14, 0.018, 4, '#d79a86'],
      [130, 12, 0.026, 10, '#9c6f74'],
      [150, 9, 0.034, 22, '#55684f'],
    ]) {
      g.fillStyle = col
      g.beginPath()
      g.moveTo(0, H)
      for (let x = 0; x <= W; x += 8) g.lineTo(x, hill(x, base, amp, f, speed))
      g.lineTo(W, H)
      g.fill()
    }
    const near = x => hill(x, 150, 9, 0.034, 22)
    g.fillStyle = '#3f5440'
    for (let i = 0; i < 7; i++) {
      const x = wrap(i * 61 - t * 22, W + 60) - 30
      const y = near(x)
      g.beginPath()
      g.moveTo(x - 6, y + 2)
      g.lineTo(x, y - 20 - (i % 3) * 5)
      g.lineTo(x + 6, y + 2)
      g.fill()
    }
    // birds flying home
    g.strokeStyle = '#4a3b48'
    g.lineWidth = 1.5
    for (let i = 0; i < 4; i++) {
      const x = wrap(i * 85 + t * (14 + i * 3), W + 40) - 20
      const y = 38 + i * 9 + Math.sin(t * 0.7 + i) * 5
      const w = Math.sin(t * 8 + i * 1.7) * 4
      g.beginPath()
      g.moveTo(x - 6, y - w)
      g.lineTo(x, y)
      g.lineTo(x + 6, y - w)
      g.stroke()
    }
    // a fox trots across every twenty seconds
    const n = Math.floor(t / 20)
    const c = t - n * 20
    if (c < 7) {
      const x = -30 + (c / 7) * (W + 60)
      const y = near(x) - 7
      const step = Math.sin(c * 14)
      if (c > 1 && s.fox !== n) {
        s.fox = n
        emit('fox')
      }
      g.fillStyle = '#e0763a'
      oval(g, x - 15, y - 2 + step * 0.5, 10, 4, -0.3)
      g.fillStyle = '#fbf3e6'
      circle(g, x - 24, y + 1, 2.6)
      g.strokeStyle = '#7a3e22'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x - 5, y + 3)
      g.lineTo(x - 5 + step * 3, y + 9)
      g.moveTo(x + 6, y + 3)
      g.lineTo(x + 6 - step * 3, y + 9)
      g.stroke()
      g.fillStyle = '#e0763a'
      oval(g, x, y, 11, 5)
      circle(g, x + 11, y - 4, 5)
      g.beginPath()
      g.moveTo(x + 8, y - 7)
      g.lineTo(x + 10, y - 14)
      g.lineTo(x + 14, y - 8)
      g.fill()
      g.fillStyle = '#fbf3e6'
      circle(g, x + 15, y - 3, 2)
    }
    banner(g, 'WILD HILLS', '#8a6a66')
  },
}

const cartoon = {
  name: 'Blob Adventures',
  about: 'A cartoon: a round pink blob hops along under a row of blocks, and keeps bonking his head on them.',
  color: '#e8739a',
  lines: ['I love this show.', 'Go, blob, go!', 'Classic blob.', 'This is the best episode.', 'Look at him go!'],
  events: { bonk: { all: 'laugh', chance: 1, lines: ['Hahaha!', 'Not again!', 'He never learns!', 'Bonk! Haha.'] } },
  init: () => ({ bonk: null }),
  draw(g, t, s, emit) {
    g.fillStyle = '#8fd3f4'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 3; i++) {
      const x = wrap(i * 130 - t * 12, W + 120) - 60
      const y = 20 + i * 12
      circle(g, x, y, 12)
      circle(g, x + 14, y - 5, 14)
      circle(g, x + 30, y, 11)
      box(g, x - 10, y, 50, 11, 5)
    }
    // the ground slides by
    const speed = 60
    g.fillStyle = '#7cc56f'
    g.fillRect(0, 140, W, 40)
    g.fillStyle = '#6ab45e'
    for (let x = -((t * speed) % 32); x < W; x += 32) g.fillRect(x, 144, 16, 36)
    g.fillStyle = '#5a9e4f'
    g.fillRect(0, 140, W, 4)
    // a block every 140 px; every fourth one is the one he jumps into
    const BX = 110
    const ib = Math.round((t * speed + BX) / 560) * 4
    const d = t - (ib * 140 - BX) / speed
    const first = Math.floor((t * speed - 40) / 140)
    g.font = '900 15px "Segoe UI", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (let i = first; i < first + 5; i++) {
      const x = i * 140 - t * speed
      const y = 40 - (i === ib && d > 0 && d < 0.3 ? Math.sin((d / 0.3) * Math.PI) * 7 : 0)
      g.fillStyle = '#ffcc4d'
      box(g, x - 11, y, 22, 22, 4)
      g.strokeStyle = '#c98a1f'
      g.lineWidth = 2
      g.beginPath()
      g.roundRect(x - 11, y, 22, 22, 4)
      g.stroke()
      g.fillStyle = '#c98a1f'
      g.fillText('?', x, y + 12)
    }
    // the blob: hops along, or jumps into a block and then sits there dizzy
    let y
    let sx = 1
    let sy = 1
    const dizzy = d >= 0.35 && d < 2.1
    if (Math.abs(d) < 0.35) y = 124 - (1 - (d / 0.35) ** 2) * 46
    else if (dizzy) {
      y = 124
      sx = 1.1
      sy = 0.92
    } else {
      const ph = (t % 0.7) / 0.7
      y = 124 - Math.sin(ph * Math.PI) * 28
      if (ph < 0.1 || ph > 0.9) {
        sx = 1.18
        sy = 0.84
      } else {
        sx = 0.94
        sy = 1.06
      }
    }
    if (d >= 0 && s.bonk !== ib) {
      s.bonk = ib
      emit('bonk')
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.15)'
    oval(g, BX, 141, 14 * (1 - (124 - y) / 90), 3)
    g.fillStyle = '#ff8fb1'
    oval(g, BX, y + 16 * (1 - sy), 16 * sx, 16 * sy)
    if (dizzy) {
      g.strokeStyle = '#3f332c'
      g.lineWidth = 1.4
      for (const ex of [BX - 5, BX + 6]) {
        g.beginPath()
        for (let a = 0; a < 9; a += 0.5) g.lineTo(ex + Math.cos(a + t * 8) * a * 0.45, y - 3 + Math.sin(a + t * 8) * a * 0.45)
        g.stroke()
      }
      g.fillStyle = '#ffd84d'
      for (let k = 0; k < 3; k++) {
        const a = t * 5 + (k * TAU) / 3
        star(g, BX + Math.cos(a) * 14, y - 22 + Math.sin(a) * 4, 4)
      }
    } else {
      g.fillStyle = '#ffffff'
      oval(g, BX - 5, y - 4, 4, 5)
      oval(g, BX + 6, y - 4, 4, 5)
      g.fillStyle = '#3f332c'
      circle(g, BX - 4, y - 3, 2)
      circle(g, BX + 7, y - 3, 2)
    }
    g.fillStyle = 'rgba(255, 90, 120, 0.45)'
    circle(g, BX - 10, y + 3, 2.5)
    circle(g, BX + 11, y + 3, 2.5)
    if (d >= 0 && d < 0.7) {
      // the burst and the word
      g.fillStyle = '#fff3a0'
      star(g, BX, 64, 12 + d * 10)
      g.font = '900 18px "Segoe UI", sans-serif'
      g.lineWidth = 4
      g.strokeStyle = '#ffffff'
      g.strokeText('BONK!', BX + 48, 72)
      g.fillStyle = '#ff5a5a'
      g.fillText('BONK!', BX + 48, 72)
    }
    banner(g, 'BLOB ADVENTURES', '#e8739a')
  },
}

const football = {
  name: 'Studio League',
  about: 'Football: the Oranges against the Blues. Somebody scores every minute or so.',
  color: '#4f9a4a',
  lines: ['Pass it!', 'Come on, come on!', 'Go, go, go!', 'Shoot!', 'Who are we cheering for?', 'The Oranges look good today.'],
  events: {
    goal: { all: 'cheer', chance: 1, lines: ['GOAL!', 'Yes! What a goal!', 'Did you see that?!'] },
    miss: { one: 'gasp', chance: 0.8, lines: ['So close!', 'Oh, nearly!', 'Wide! Argh.'] },
  },
  init() {
    // a keeper and four out-field players a side; the Oranges (team 0) attack to the right
    const FORM = [
      [26, 97],
      [70, 60],
      [70, 134],
      [118, 80],
      [118, 114],
    ]
    const players = []
    for (const team of [0, 1])
      for (const [hx, hy] of FORM) {
        const x = team ? W - hx : hx
        players.push({ team, hx: x, hy, x, y: hy, seed: Math.random() * 10 })
      }
    return { players, ball: { x: 160, y: 97 }, from: { x: 160, y: 97 }, to: 3, pt: 0, pd: 0.8, score: [0, 0], shot: null, goalT: 0, next: rnd(10, 20), clock: 0, last: null }
  },
  draw(g, t, s, emit) {
    const dt = s.last === null ? 0 : Math.max(0, Math.min(0.2, t - s.last))
    s.last = t
    s.clock += dt
    const b = s.ball
    const P = s.players
    // the pitch
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i % 2 ? '#5fa35a' : '#69ad63'
      g.fillRect(i * 32, 0, 32, H)
    }
    g.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    g.lineWidth = 1.5
    g.strokeRect(12, 24, W - 24, H - 34)
    g.beginPath()
    g.moveTo(160, 24)
    g.lineTo(160, H - 10)
    g.moveTo(180, 97)
    g.arc(160, 97, 20, 0, TAU)
    g.stroke()
    g.strokeRect(12, 67, 30, 60)
    g.strokeRect(W - 42, 67, 30, 60)
    g.fillStyle = 'rgba(255, 255, 255, 0.85)'
    g.fillRect(5, 85, 7, 24)
    g.fillRect(W - 12, 85, 7, 24)
    // the play: passes, a shot every so often, and after a goal a kick-off
    if (s.goalT > 0) {
      s.goalT -= dt
      if (s.goalT <= 0) {
        b.x = 160
        b.y = 97
        s.from = { x: 160, y: 97 }
        s.to = (1 - s.scorer) * 5 + 1 + Math.floor(Math.random() * 4)
        s.pt = 0
        s.pd = 0.7
      }
    } else if (s.shot) {
      const sh = s.shot
      sh.t += dt
      const u = Math.min(1, sh.t / 0.55)
      b.x = sh.fx + (sh.tx - sh.fx) * u
      b.y = sh.fy + (sh.ty - sh.fy) * u
      if (u >= 1) {
        s.shot = null
        if (sh.goal) {
          s.score[sh.team]++
          s.goalT = 2.6
          s.scorer = sh.team
          emit('goal')
        } else {
          emit('miss')
          s.from = { x: b.x, y: b.y }
          s.to = (1 - sh.team) * 5 // the other side's keeper fetches it
          s.pt = 0
          s.pd = 0.5
        }
      }
    } else {
      s.pt += dt
      const p = P[s.to]
      const u = Math.min(1, s.pt / s.pd)
      b.x = s.from.x + (p.x - s.from.x) * u
      b.y = s.from.y + (p.y - s.from.y) * u
      if (u >= 1) {
        if (s.clock > s.next && s.to % 5 !== 0) {
          s.next = s.clock + rnd(16, 30)
          const goal = Math.random() < 0.6
          const side = Math.random() < 0.5 ? -1 : 1
          s.shot = { t: 0, fx: b.x, fy: b.y, tx: p.team ? 7 : W - 7, ty: goal ? 97 + rnd(-8, 8) : 97 + side * rnd(16, 26), goal, team: p.team }
        } else {
          let next = s.to
          while (next === s.to) {
            const mate = Math.random() < 0.7
            next = Math.floor(Math.random() * P.length)
            if (mate && P[next].team !== p.team) next = s.to
          }
          s.from = { x: b.x, y: b.y }
          s.to = next
          s.pt = 0
          s.pd = Math.max(0.35, Math.min(1.4, Math.hypot(P[next].x - b.x, P[next].y - b.y) / 110))
        }
      }
    }
    // everyone drifts towards the ball from their spot; keepers stay on their line
    const k = Math.min(1, dt * 2)
    P.forEach((p, i) => {
      let tx = p.hx + (b.x - p.hx) * 0.35 + Math.sin(t * 0.9 + p.seed) * 6
      let ty = p.hy + (b.y - p.hy) * 0.35 + Math.cos(t * 0.7 + p.seed) * 5
      if (i % 5 === 0) {
        tx = p.hx
        ty = Math.max(88, Math.min(106, b.y))
      }
      p.x += (tx - p.x) * k
      p.y += (ty - p.y) * k
    })
    for (const [i, p] of P.entries()) {
      g.fillStyle = 'rgba(0, 0, 0, 0.18)'
      oval(g, p.x + 1, p.y + 5, 5, 2)
      g.fillStyle = p.team ? (i % 5 ? '#5b86c4' : '#7fc4a0') : i % 5 ? '#e8834f' : '#f2c14e'
      circle(g, p.x, p.y, 5)
      g.strokeStyle = '#ffffff'
      g.lineWidth = 1.2
      g.stroke()
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.2)'
    oval(g, b.x + 1, b.y + 3, 3, 1.4)
    g.fillStyle = '#ffffff'
    circle(g, b.x, b.y, 2.8)
    // the score
    g.fillStyle = 'rgba(30, 30, 40, 0.78)'
    box(g, 8, 4, 132, 16, 4)
    g.fillStyle = '#e8834f'
    g.fillRect(13, 9, 6, 6)
    g.fillStyle = '#5b86c4'
    g.fillRect(96, 9, 6, 6)
    g.fillStyle = '#ffffff'
    g.font = '700 10px "Segoe UI", sans-serif'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText(`ORA  ${s.score[0]} - ${s.score[1]}  BLU`, 22, 12.5)
    g.textAlign = 'right'
    g.fillText(`${(Math.floor(s.clock / 2) % 90) + 1}'`, 136, 12.5)
    if (s.goalT > 0) {
      const size = 32 + Math.sin(t * 12) * 3
      g.font = `900 ${size.toFixed(0)}px "Segoe UI", sans-serif`
      g.textAlign = 'center'
      g.lineWidth = 6
      g.strokeStyle = '#3f332c'
      g.strokeText('GOAL!', W / 2, H / 2)
      g.fillStyle = s.scorer ? '#9cc4ff' : '#ffb27a'
      g.fillText('GOAL!', W / 2, H / 2)
    }
    banner(g, 'STUDIO LEAGUE · LIVE', '#3f7a3b')
  },
}

const space = {
  name: 'Starlight',
  about: 'A space documentary: a ringed planet turning slowly, its little moon, and a comet now and then.',
  color: '#6a5ac8',
  lines: ['Space is so big.', 'Whoa.', 'We are so tiny.', 'I want to fly a rocket.', 'How far away is that?'],
  events: { comet: { one: 'gasp', chance: 0.7, lines: ['A comet!', 'Quick, make a wish!', 'Whoa, did you see that?'] } },
  init() {
    const r = seeded(7)
    return { comet: -1, stars: Array.from({ length: 80 }, () => ({ x: r() * W, y: r() * H, s: 0.5 + r() * 1.3, d: 0.3 + r(), p: r() * TAU })) }
  },
  draw(g, t, s, emit) {
    const bg = g.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#10153a')
    bg.addColorStop(1, '#2d2257')
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    const neb = g.createRadialGradient(80, 60, 5, 80, 60, 90)
    neb.addColorStop(0, 'rgba(200, 120, 200, 0.28)')
    neb.addColorStop(1, 'rgba(200, 120, 200, 0)')
    g.fillStyle = neb
    g.fillRect(0, 0, 200, 160)
    g.fillStyle = '#ffffff'
    for (const st of s.stars) {
      g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.3 * st.d + st.p))
      g.fillRect(wrap(st.x - t * 3 * st.d, W), st.y, st.s, st.s)
    }
    g.globalAlpha = 1
    const cx = 205
    const cy = 92
    const ring = front => {
      const [a0, a1] = front ? [0, Math.PI] : [Math.PI, TAU]
      g.strokeStyle = 'rgba(242, 214, 176, 0.9)'
      g.lineWidth = 5
      g.beginPath()
      g.ellipse(cx, cy, 58, 13, -0.25, a0, a1)
      g.stroke()
      g.strokeStyle = 'rgba(200, 160, 130, 0.7)'
      g.lineWidth = 2
      g.beginPath()
      g.ellipse(cx, cy, 66, 15, -0.25, a0, a1)
      g.stroke()
    }
    const a = t * 0.45
    const moon = () => {
      g.fillStyle = '#cfd3dc'
      circle(g, cx + Math.cos(a) * 84, cy + Math.sin(a) * 22 - 4, 6)
    }
    if (Math.sin(a) < 0) moon()
    ring(false)
    g.save()
    g.beginPath()
    g.arc(cx, cy, 32, 0, TAU)
    g.clip()
    g.fillStyle = '#e3a27a'
    g.fillRect(cx - 32, cy - 32, 64, 64)
    g.translate(cx, cy)
    g.rotate(-0.25)
    for (let i = -3; i <= 3; i++) {
      g.fillStyle = i % 2 ? 'rgba(255, 222, 186, 0.45)' : 'rgba(170, 96, 74, 0.32)'
      g.fillRect(-40, i * 9 - 3, 80, 6)
    }
    g.fillStyle = 'rgba(150, 70, 60, 0.6)'
    oval(g, wrap(t * 7, 90) - 45, 9, 7, 3)
    g.restore()
    const shade = g.createRadialGradient(cx - 12, cy - 12, 4, cx, cy, 34)
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.18)')
    shade.addColorStop(1, 'rgba(20, 10, 40, 0.55)')
    g.fillStyle = shade
    circle(g, cx, cy, 32)
    ring(true)
    if (Math.sin(a) >= 0) moon()
    // a comet every sixteen seconds
    const n = Math.floor(t / 16)
    const c = t - n * 16
    if (c < 3.2) {
      const u = c / 3.2
      const x = -30 + u * (W + 80)
      const y = 18 + u * 60
      const tail = g.createLinearGradient(x, y, x - 54, y - 20)
      tail.addColorStop(0, 'rgba(255, 255, 255, 0.9)')
      tail.addColorStop(1, 'rgba(160, 200, 255, 0)')
      g.strokeStyle = tail
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x - 54, y - 20)
      g.stroke()
      g.fillStyle = '#ffffff'
      circle(g, x, y, 2.5)
      if (c > 0.6 && s.comet !== n) {
        s.comet = n
        emit('comet')
      }
    }
    banner(g, 'STARLIGHT', '#5a4ab0')
  },
}

const kitten = {
  name: 'Kitten Cam',
  about: 'A live camera on a ginger kitten chasing a red laser dot round a living room.',
  color: '#dc9c68',
  lines: ['Aww!', 'Get it, kitty!', 'So fluffy.', 'Our cat does that too.', 'I could watch this all day.'],
  events: { pounce: { all: 'laugh', chance: 0.9, lines: ['Aww!', 'Got it! Well, almost.', 'So cute!', 'Pounce!'] } },
  init: () => ({ x: 160, y: 150, face: 1, pounce: -1, last: null }),
  draw(g, t, s, emit) {
    const dt = s.last === null ? 0 : Math.max(0, Math.min(0.2, t - s.last))
    s.last = t
    g.fillStyle = '#efe3f3'
    g.fillRect(0, 0, W, 112)
    g.fillStyle = 'rgba(195, 182, 214, 0.5)'
    for (let y = 10; y < 108; y += 24) for (let x = (y / 24) % 2 ? 22 : 10; x < W; x += 24) circle(g, x, y, 2)
    // a picture, a sofa, the floor and a rug
    g.fillStyle = '#b98a63'
    box(g, 36, 26, 52, 40, 3)
    g.fillStyle = '#9fb39a'
    box(g, 41, 31, 42, 30, 2)
    g.fillStyle = '#f2c9ad'
    circle(g, 72, 40, 5)
    g.fillStyle = '#c3b6d6'
    box(g, 228, 70, 96, 44, 10)
    g.fillStyle = '#e9dcc6'
    box(g, 238, 60, 34, 22, 8)
    box(g, 276, 60, 34, 22, 8)
    g.fillStyle = '#fbf3e6'
    g.fillRect(0, 108, W, 6)
    g.fillStyle = '#dcb58e'
    g.fillRect(0, 114, W, H - 114)
    g.strokeStyle = 'rgba(150, 105, 70, 0.3)'
    g.lineWidth = 1
    g.beginPath()
    for (const y of [126, 140, 156, 172]) {
      g.moveTo(0, y)
      g.lineTo(W, y)
    }
    g.stroke()
    g.fillStyle = '#c3b6d6'
    oval(g, 160, 152, 112, 17)
    // the laser dot, and the kitten after it (every ten seconds a pounce)
    const lx = 160 + Math.sin(t * 1.25) * 105 + Math.sin(t * 3.1) * 18
    const ly = 150 + Math.sin(t * 1.9) * 14
    const n = Math.floor(t / 10)
    const c = t - n * 10
    const jumping = c > 8.4 && c < 9.2
    const k = Math.min(1, dt * (jumping ? 6 : 1.8))
    s.x += (lx - s.x) * k
    s.y += (ly - s.y) * k
    const hop = jumping ? Math.sin(((c - 8.4) / 0.8) * Math.PI) * 26 : 0
    if (jumping && s.pounce !== n) {
      s.pounce = n
      emit('pounce')
    }
    const vx = lx - s.x
    if (Math.abs(vx) > 6) s.face = Math.sign(vx)
    const f = s.face
    const x = s.x
    const y = s.y - hop
    const moving = Math.abs(vx) > 10
    g.fillStyle = 'rgba(0, 0, 0, 0.12)'
    oval(g, s.x, s.y + 2, 18, 4)
    g.strokeStyle = '#dc9c68'
    g.lineWidth = 4
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(x - f * 15, y - 10)
    g.quadraticCurveTo(x - f * 30, y - 16 + Math.sin(t * 6) * 6, x - f * 26, y - 30 + Math.sin(t * 6 + 1) * 5)
    g.stroke()
    g.fillStyle = '#dc9c68'
    for (const [dx, ph] of [
      [-10, 0],
      [-4, 1.6],
      [6, 3.1],
      [12, 4.7],
    ]) {
      const lift = moving ? Math.max(0, Math.sin(t * 14 + ph)) * 3 : 0
      box(g, x + dx * f - 2, y - 4 - lift, 4, 8, 2)
    }
    oval(g, x, y - 9, 17, 9)
    g.fillStyle = '#f6e8d6'
    oval(g, x + f * 2, y - 5, 10, 4)
    g.fillStyle = '#dc9c68'
    circle(g, x + f * 15, y - 19, 9)
    for (const [a, b, c2] of [
      [10, 12, 16],
      [17, 21, 22],
    ]) {
      g.beginPath()
      g.moveTo(x + f * a, y - 25)
      g.lineTo(x + f * b, y - 34)
      g.lineTo(x + f * c2, y - 26)
      g.fill()
    }
    g.fillStyle = '#3f332c'
    circle(g, x + f * 13, y - 20, 1.8)
    circle(g, x + f * 19, y - 20, 1.8)
    g.fillStyle = '#e88a8a'
    circle(g, x + f * 22, y - 17, 1.3)
    const glow = g.createRadialGradient(lx, ly, 0, lx, ly, 9)
    glow.addColorStop(0, 'rgba(255, 60, 60, 0.7)')
    glow.addColorStop(1, 'rgba(255, 60, 60, 0)')
    g.fillStyle = glow
    circle(g, lx, ly, 9)
    g.fillStyle = '#ff3030'
    circle(g, lx, ly, 2.2)
    if (t % 1.4 < 0.8) {
      g.fillStyle = '#ff3b3b'
      circle(g, W - 42, 13, 4)
    }
    g.fillStyle = '#3f332c'
    g.font = '700 10px "Segoe UI", sans-serif'
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText('REC', W - 34, 13.5)
    banner(g, 'KITTEN CAM', '#c27a45')
  },
}

const CHANNELS = [kitchen, nature, cartoon, football, space, kitten]

// ------------------------------------------------------------------------------------------------ the remote's look

const CSS = `
.tv-tag { position: fixed; z-index: 29; transform: translate(-50%, -100%); display: none; align-items: center; gap: 6px;
  padding: 3px 10px 3px 8px; border-radius: 999px; background: var(--card); border: 1px solid var(--card-line); box-shadow: var(--shadow);
  color: var(--ink); font: 700 11px "Segoe UI", sans-serif; white-space: nowrap; cursor: pointer; user-select: none; }
.tv-tag .tv-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.tv-tag .tv-on { color: var(--muted); font-weight: 600; }
.tv-tip { position: fixed; z-index: 45; pointer-events: none; background: #fff8ec; color: #3f332c; border: 2px solid #d97757;
  border-radius: 10px; padding: 3px 9px; font: 700 12px "Segoe UI", sans-serif; box-shadow: 0 4px 12px rgba(63, 51, 44, 0.22);
  white-space: nowrap; display: none; }
.tv-card { position: fixed; z-index: 47; width: 300px; background: var(--card); color: var(--ink); border: 1px solid var(--card-line);
  border-radius: 14px; padding: 10px 12px 12px; box-shadow: var(--shadow); font: 13px/1.4 "Segoe UI", sans-serif; backdrop-filter: blur(8px); }
.tv-card .tv-head { display: flex; align-items: baseline; gap: 7px; font-weight: 700; }
.tv-card .tv-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; align-self: center; }
.tv-card .tv-ch { font-weight: 600; font-size: 12px; color: var(--muted); }
.tv-card .tv-x { margin-left: auto; border: 0; background: none; color: var(--muted); font-size: 15px; cursor: pointer; padding: 0 2px; }
.tv-card canvas { display: block; width: 100%; height: auto; margin-top: 8px; border-radius: 6px; background: #15151a;
  box-shadow: 0 0 0 4px #f1e8da, 0 0 0 5px rgba(140, 110, 80, 0.3); }
.tv-card p { margin: 8px 0 0; font-size: 12px; }
.tv-card .tv-muted { color: var(--muted); font-size: 11px; margin-top: 6px; }
.tv-card .tv-row { display: flex; align-items: center; gap: 6px; margin-top: 9px; }
.tv-card .tv-b { border: 1px solid var(--card-line); background: transparent; color: var(--ink); border-radius: 999px; width: 28px; height: 26px;
  font: 700 12px "Segoe UI", sans-serif; cursor: pointer; padding: 0; }
.tv-card .tv-num { font-size: 11px; color: var(--muted); min-width: 64px; text-align: center; }
.tv-card .tv-seg { display: flex; margin-left: auto; border: 1px solid var(--card-line); border-radius: 999px; overflow: hidden; }
.tv-card .tv-seg button { border: 0; background: transparent; padding: 4px 10px; font: 700 12px "Segoe UI", sans-serif; color: var(--ink); cursor: pointer; }
.tv-card .tv-seg button.sel { background: #c8775a; color: #fff; }
`

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

// ------------------------------------------------------------------------------------------------ the feature

export function makeTv(ctx) {
  const { THREE, world, people, camera, renderer, params, sayText } = ctx
  const tv = world.tv
  if (!tv) return null
  /** ?tv (a demo switch): on from the start, people gather quickly and talk more. */
  const quick = params.has('tv')
  const arg = params.get('tv') ?? ''
  const saved = load()
  let mode = quick ? 'on' : MODES.includes(saved.mode) ? saved.mode : 'auto'
  let channel = /^\d+$/.test(arg) && Number(arg) >= 1 ? (Number(arg) - 1) % CHANNELS.length : Number.isInteger(saved.channel) ? wrap(saved.channel, CHANNELS.length) : Math.floor(Math.random() * CHANNELS.length)
  const states = CHANNELS.map(c => c.init())
  /** How far into each channel the TV has played (switching back picks up where it was). */
  const times = CHANNELS.map(() => Math.random() * 30)

  // the picture: a small canvas, the screen's texture
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tv.screenMat.map = tex
  tv.screenMat.emissiveMap = tex
  tv.screenMat.needsUpdate = true
  drawOff(g)
  tex.needsUpdate = true
  // the picture's average colour, for the light it throws (read from a 4 x 2 copy a few times a second)
  const small = document.createElement('canvas')
  small.width = 4
  small.height = 2
  const sg = small.getContext('2d', { willReadFrequently: true })
  const tint = new THREE.Color(0xbcd2ff)
  const WHITE = new THREE.Color(0xffffff)
  let lum = 0.5

  let showing = false
  let power = 0
  let idleFor = 99
  let frame = 0
  let tintIn = 0
  let staticLeft = 0
  let osd = 0
  let offDrawn = true
  let now = 0
  let gathered = false
  let reactIn = quick ? rnd(4, 7) : rnd(12, 25)
  let zapIn = quick ? rnd(40, 60) : rnd(180, 360)
  const later = []

  function save() {
    if (quick) return
    try {
      localStorage.setItem(STORE, JSON.stringify({ mode, channel }))
    } catch {
      // (a private window: the choice lasts until the page closes)
    }
  }

  // ------------------------------------------------------------------ who watches

  const here = e => !!e && people.get(e.id) === e && e.p.root.visible
  const watching = e => here(e) && e.p.seated && e.p.activity === 'watch'
  const watchers = () => [...people.values()].filter(watching)

  /** Whether someone at `pos`, facing `yaw`, sees the screen without turning round. */
  function canSee(pos, yaw) {
    const dx = tv.at.x - pos.x
    const dz = tv.at.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 7 || dist < 0.8) return false
    let d = Math.atan2(dx, dz) - yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    return Math.abs(d) < 1.2
  }
  tv.canSee = canSee
  /** For the lounge: how likely someone settling on a seat at `pos` facing `yaw` is to watch TV. */
  tv.watchChance = (pos, yaw) => {
    if (mode === 'off' || !canSee(pos, yaw)) return 0
    if (mode === 'on') return 0.8
    return showing ? 0.6 : 0.3
  }

  /** People off duty sitting where they can see the screen turn to watch it (when it is switched on). */
  function gather(chance) {
    let first = null
    for (const e of people.values()) {
      if (!e.friend || !here(e) || !e.p.seated || e.p.isBusy() || e.p.activity === 'watch' || e.p.activity === 'nap') continue
      if (!canSee(e.p.root.position, e.p.root.rotation.y) || Math.random() > chance) continue
      e.p.activity = 'watch'
      e.p.lookAt = tv.at
      first ??= e
    }
    if (first) sayLater(0.6, first, pick(TV_TIME))
  }

  function sayLater(seconds, entry, text) {
    later.push({ at: now + seconds, entry, text })
  }

  function react(e, kind) {
    if (kind === 'laugh') e.p.laugh = rnd(1.4, 2.4)
    else if (kind === 'gasp') e.p.gasp = rnd(0.9, 1.4)
    else if (kind === 'cheer') e.p.cheer = rnd(2.2, 3)
  }

  /** Something happened on screen (a goal, a bonk...): the watchers react. */
  function onEvent(name) {
    const ev = CHANNELS[channel].events?.[name]
    const list = watchers()
    if (!ev || !list.length || power < 0.8 || Math.random() > (ev.chance ?? 1)) return
    const speaker = pick(list)
    if (ev.all) for (const e of list) react(e, ev.all)
    if (ev.one) react(speaker, ev.one)
    sayText(speaker, pick(ev.lines))
    const other = list.filter(e => e !== speaker)
    if (ev.all === 'cheer' && other.length) sayLater(1.6, pick(other), pick(['Get in!', 'Yes, yes, yes!', 'Woo!']))
  }

  /** Now and then a watcher says something about the show. */
  function chatter(dt, list) {
    if ((reactIn -= dt) > 0) return
    reactIn = quick ? rnd(5, 9) : rnd(14, 28)
    const free = list.filter(e => e.voice.left <= 0)
    const talking = [...people.values()].filter(e => e.voice?.left > 0).length
    if (!free.length || talking >= 2 || power < 0.8) return
    const e = pick(free)
    const line = Math.random() < 0.8 ? pick(CHANNELS[channel].lines) : pick(ANY)
    sayText(e, line)
    if (/haha|aww/i.test(line)) e.p.laugh = rnd(1, 1.8)
  }

  /** Every few minutes someone takes the remote. */
  function zap(dt, list) {
    if ((zapIn -= dt) > 0) return
    zapIn = quick ? rnd(40, 60) : rnd(180, 360)
    sayText(pick(list), pick(ZAP))
    setChannel(channel + 1 + Math.floor(Math.random() * (CHANNELS.length - 1)), false)
  }

  function setChannel(i, byUser) {
    channel = wrap(i, CHANNELS.length)
    staticLeft = 0.45
    osd = 2.6
    save()
    const list = watchers()
    if (byUser && list.length && Math.random() < 0.6) sayLater(0.8, pick(list), pick(NEW_PICK))
    refreshCard()
  }

  function setMode(m) {
    if (m === mode) return
    mode = m
    save()
    if (m === 'off') {
      const list = watchers()
      for (const e of list) {
        e.p.activity = Math.random() < 0.5 ? 'read' : 'idle'
        e.p.lookAt = null
      }
      if (list.length) sayText(pick(list), pick(TURNED_OFF))
    } else if (m === 'on') gather(0.75)
    refreshCard()
  }

  // ------------------------------------------------------------------ the picture

  function paint() {
    const ch = CHANNELS[channel]
    if (staticLeft > 0) drawStatic(g)
    else ch.draw(g, times[channel], states[channel], name => onEvent(name))
    if (osd > 0 && staticLeft <= 0) {
      g.globalAlpha = Math.min(1, osd * 2)
      g.font = '700 15px "Segoe UI", sans-serif'
      g.textAlign = 'right'
      g.textBaseline = 'top'
      g.fillStyle = 'rgba(0, 0, 0, 0.45)'
      g.fillText(`CH ${channel + 1}`, W - 9, 31)
      g.fillStyle = '#8dffa0'
      g.fillText(`CH ${channel + 1}`, W - 10, 30)
      g.globalAlpha = 1
    }
    tex.needsUpdate = true
  }

  function sampleTint() {
    sg.drawImage(canvas, 0, 0, 4, 2)
    const d = sg.getImageData(0, 0, 4, 2).data
    let r = 0
    let gr = 0
    let b = 0
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]
      gr += d[i + 1]
      b += d[i + 2]
    }
    const n = (d.length / 4) * 255
    r /= n
    gr /= n
    b /= n
    lum = 0.3 * r + 0.59 * gr + 0.11 * b
    const m = Math.max(r, gr, b, 0.05)
    // the hue of the picture at full strength, with a little white: a screen's light is never one pure colour
    tint.setRGB(r / m, gr / m, b / m, THREE.SRGBColorSpace).lerp(WHITE, 0.25)
  }

  // ------------------------------------------------------------------ the tag, the tip and the remote's card

  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const tag = document.createElement('div')
  tag.className = 'tv-tag'
  const tagDot = document.createElement('span')
  tagDot.className = 'tv-dot'
  const tagOn = document.createElement('span')
  tagOn.className = 'tv-on'
  tagOn.textContent = 'On TV'
  const tagName = document.createElement('span')
  tag.append(tagDot, tagOn, tagName)
  tag.title = 'The TV: click for the remote'
  tag.addEventListener('click', e => {
    e.stopPropagation()
    openCard(e.clientX, e.clientY)
  })
  document.body.append(tag)
  let tagShows = -1
  const tagAt = new THREE.Vector3()
  function placeTag() {
    const show = showing && power > 0.5 && !card
    if (!show) {
      tag.style.display = 'none'
      return
    }
    tagAt.copy(tv.at)
    tagAt.y += 0.62
    tagAt.project(camera)
    const ok = tagAt.z < 1 && Math.abs(tagAt.x) < 1.02 && Math.abs(tagAt.y) < 1.02
    tag.style.display = ok ? 'flex' : 'none'
    if (!ok) return
    tag.style.left = `${((tagAt.x * 0.5 + 0.5) * window.innerWidth).toFixed(1)}px`
    tag.style.top = `${((-tagAt.y * 0.5 + 0.5) * window.innerHeight).toFixed(1)}px`
    if (tagShows !== channel) {
      tagShows = channel
      tagDot.style.background = CHANNELS[channel].color
      tagName.textContent = CHANNELS[channel].name
    }
  }

  const tip = document.createElement('div')
  tip.className = 'tv-tip'
  document.body.append(tip)
  // the hover hook only runs when no feature before this one answered: a pointer move that skipped it hides the tip
  // (this listener runs after the page's own, which calls the hooks)
  let hovered = false
  renderer.domElement.addEventListener('pointermove', () => {
    if (!hovered) showTip('', 0, 0)
    hovered = false
  })
  renderer.domElement.addEventListener('pointerleave', () => showTip('', 0, 0))
  function showTip(text, x, y) {
    tip.style.display = text ? 'block' : 'none'
    if (!text) return
    tip.textContent = text
    tip.style.left = `${x + 16}px`
    tip.style.top = `${y + 14}px`
  }

  let card = null
  let cardTick = 0
  function closeCard() {
    card?.el.remove()
    card = null
  }
  function button(text, title, onClick, cls = 'tv-b') {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = cls
    b.textContent = text
    if (title) b.title = title
    b.addEventListener('click', onClick)
    return b
  }
  function openCard(x, y) {
    closeCard()
    showTip('', 0, 0)
    const el = document.createElement('div')
    el.className = 'tv-card'
    const head = document.createElement('div')
    head.className = 'tv-head'
    const dot = document.createElement('span')
    dot.className = 'tv-dot'
    const title = document.createElement('span')
    title.textContent = 'TV'
    const ch = document.createElement('span')
    ch.className = 'tv-ch'
    const x0 = button('×', 'Close', closeCard, 'tv-x')
    head.append(dot, title, ch, x0)
    const about = document.createElement('p')
    const who = document.createElement('p')
    who.className = 'tv-muted'
    const row = document.createElement('div')
    row.className = 'tv-row'
    const num = document.createElement('span')
    num.className = 'tv-num'
    const seg = document.createElement('div')
    seg.className = 'tv-seg'
    const segs = {}
    for (const m of MODES) {
      segs[m] = button(m === 'auto' ? 'Auto' : m === 'on' ? 'On' : 'Off', NOTES[m], () => setMode(m), '')
      seg.append(segs[m])
    }
    row.append(button('‹', 'Previous channel', () => setChannel(channel - 1, true)), num, button('›', 'Next channel', () => setChannel(channel + 1, true)), seg)
    const note = document.createElement('p')
    note.className = 'tv-muted'
    el.append(head, canvas, about, who, row, note)
    document.body.append(el)
    el.addEventListener('pointerdown', e => e.stopPropagation())
    card = { el, dot, ch, about, who, num, segs, note }
    refreshCard()
    const w = el.offsetWidth
    const h = el.offsetHeight
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x + 14))}px`
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y - h / 2))}px`
  }
  function refreshCard() {
    if (!card) return
    const c = CHANNELS[channel]
    card.dot.style.background = c.color
    card.ch.textContent = c.name
    card.about.textContent = c.about
    const list = watchers()
    card.who.textContent = list.length ? `Watching: ${list.map(e => e.persona.name).join(', ')}` : mode === 'off' ? 'The TV is off.' : 'Nobody on the sofa is watching right now.'
    card.num.textContent = `Channel ${channel + 1} of ${CHANNELS.length}`
    for (const m of MODES) card.segs[m].classList.toggle('sel', m === mode)
    card.note.textContent = NOTES[mode]
  }
  window.addEventListener('keydown', e => e.key === 'Escape' && closeCard())

  const hitPoint = new THREE.Vector3()
  const onTv = hit => !!hit.ray.ray.intersectBox(tv.box, hitPoint)

  // ------------------------------------------------------------------ each frame

  return {
    step(dt, t) {
      now += dt
      const list = watchers()
      idleFor = list.length ? 0 : idleFor + dt
      // Auto: on while someone watches (and a few seconds after), or while the remote's card is open
      const want = mode === 'on' || (mode === 'auto' && (list.length > 0 || idleFor < 8 || !!card))
      if (want !== showing) {
        showing = want
        if (showing) {
          osd = 2.6
          offDrawn = false
        }
      }
      power = showing ? Math.min(1, power + dt * 2.5) : Math.max(0, power - dt * 2)
      if (quick && !gathered && now > 4) {
        gathered = true
        gather(1)
      }
      if (arg === 'card' && !card && now > 1.5 && now < 2) openCard(window.innerWidth * 0.55, window.innerHeight * 0.35)

      if (power > 0) {
        times[channel] += dt
        if (staticLeft > 0) staticLeft -= dt
        if (osd > 0) osd -= dt
        if ((frame += dt) >= 1 / 15) {
          frame = 0
          paint()
        }
        if ((tintIn -= dt) <= 0) {
          tintIn = 0.25
          sampleTint()
        }
      } else if (!offDrawn) {
        offDrawn = true
        drawOff(g)
        tex.needsUpdate = true
      }
      const flicker = 1 + Math.sin(t * 11) * 0.05 + Math.sin(t * 23.7) * 0.03
      tv.screenMat.emissiveIntensity = power * 0.95
      tv.light.intensity = power * (1.4 + 3.6 * lum) * flicker
      tv.light.color.copy(tint)
      tv.halo.material.color.copy(tint)
      tv.halo.material.opacity = power * (0.14 + 0.28 * lum) * flicker
      tv.popcorn.visible = showing && list.length > 0

      if (showing && list.length) {
        chatter(dt, list)
        zap(dt, list)
      }
      for (let i = later.length - 1; i >= 0; i--) {
        const l = later[i]
        if (now < l.at) continue
        later.splice(i, 1)
        if (here(l.entry)) sayText(l.entry, l.text)
      }
      placeTag()
      if (card && (cardTick += dt) > 0.5) {
        cardTick = 0
        refreshCard()
      }
    },
    click(hit) {
      if (onTv(hit)) {
        if (card) closeCard()
        else openCard(hit.x, hit.y)
        return true
      }
      closeCard()
      return undefined
    },
    hover(hit) {
      hovered = true
      if (!onTv(hit)) {
        showTip('', 0, 0)
        return ''
      }
      showTip(showing ? `On TV: ${CHANNELS[channel].name}. Click for the remote.` : 'The TV. Click for the remote.', hit.x, hit.y)
      return 'pointer'
    },
    gone(entry) {
      for (let i = later.length - 1; i >= 0; i--) if (later[i].entry === entry) later.splice(i, 1)
    },
  }
}
