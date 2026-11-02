// The room's design: what a person may change (colours, floor, furniture styles, lamp warmth), the theme presets, and
// the strict check every design goes through. The page (room.js, features/decorate.js) and the server
// (server-features/decorate.mjs) both import this file, so it has no imports and touches no browser or node API.
//
// A design looks like this:
//   { theme: 'loft',                                  // the preset it started from (a label; every field below counts)
//     colors: { walls, floor, accent, accent2, desks, sofa, rug, wood, plants, pots },   // '#rrggbb' each
//     floor: 'mixed' | 'oak' | 'concrete' | 'carpet' | 'tiles',
//     variants: { sofa: 'curved' | 'straight' | 'none', rug: 'woven' | 'plain' | 'none',
//                 plants: 'none' | 'some' | 'lush', lamps: 'all' | 'pendants' | 'floor' | 'none', poster: true | false },
//     people: 0.7..2,                                 // how big everyone is (1 as built; a design saved before this had none)
//     light: 0..1 }                                   // lamp warmth: 0 cool white, 0.5 as the loft is, 1 deep amber

/** The colours a person may change, with the words the Design tab shows. */
export const COLOR_KEYS = [
  ['walls', 'Walls'],
  ['floor', 'Floor tint'],
  ['accent', 'Accent (cushions, stools)'],
  ['accent2', 'Second accent (counter, door)'],
  ['desks', 'Desk tops'],
  ['sofa', 'Sofa fabric'],
  ['rug', 'Rugs'],
  ['wood', 'Wood (shelves, frames)'],
  ['plants', 'Plant leaves'],
  ['pots', 'Plant pots'],
]

export const FLOORS = [
  ['mixed', 'Concrete and oak'],
  ['oak', 'Oak herringbone'],
  ['concrete', 'Polished concrete'],
  ['carpet', 'Carpet'],
  ['tiles', 'Tiles'],
]

/** The furniture slots and the styles each may take. `poster` is on or off. */
export const VARIANTS = {
  sofa: [
    ['curved', 'Curved bouclé'],
    ['straight', 'Straight sofa'],
    ['none', 'No sofa'],
  ],
  rug: [
    ['woven', 'Woven pattern'],
    ['plain', 'Plain'],
    ['none', 'No rug'],
  ],
  plants: [
    ['lush', 'Lush'],
    ['some', 'Some'],
    ['none', 'None'],
  ],
  lamps: [
    ['all', 'All lamps'],
    ['pendants', 'Pendants only'],
    ['floor', 'Floor lamps only'],
    ['none', 'Dark'],
  ],
}

const design = (theme, colors, floor, variants, light) => ({ theme, colors, floor, variants, light, people: 1 })
const V = (o = {}) => ({ sofa: 'curved', rug: 'woven', plants: 'lush', lamps: 'all', poster: true, ...o })

/** The theme presets. The first, 'loft', is the room as it has always looked. */
export const THEMES = [
  {
    id: 'loft',
    name: 'Cosy loft',
    design: design(
      'loft',
      { walls: '#f3ebdf', floor: '#ffffff', accent: '#c8775a', accent2: '#9fb39a', desks: '#ebdfcb', sofa: '#f4eee4', rug: '#ffffff', wood: '#dccbb2', plants: '#6e9a62', pots: '#c8775a' },
      'mixed',
      V(),
      0.5,
    ),
  },
  {
    id: 'scandi',
    name: 'Scandinavian',
    design: design(
      'scandi',
      { walls: '#f5f7f8', floor: '#fbf6ef', accent: '#7ea6c0', accent2: '#b9c9c5', desks: '#f4f1ea', sofa: '#e4e8ea', rug: '#eef0f2', wood: '#ead8b8', plants: '#7ba870', pots: '#ece8e0' },
      'oak',
      V({ sofa: 'straight', rug: 'plain', plants: 'some' }),
      0.38,
    ),
  },
  {
    id: 'neon',
    name: 'Night neon',
    design: design(
      'neon',
      { walls: '#2d2a45', floor: '#4a4570', accent: '#ff4fa3', accent2: '#2fd6e3', desks: '#3b3a5c', sofa: '#52428a', rug: '#8a66d8', wood: '#41375f', plants: '#37d69b', pots: '#2c2748' },
      'concrete',
      V({ plants: 'some' }),
      0.12,
    ),
  },
  {
    id: 'cabin',
    name: 'Forest cabin',
    design: design(
      'cabin',
      { walls: '#a97b52', floor: '#d9b48c', accent: '#a23f2e', accent2: '#5d7a4f', desks: '#cfae7e', sofa: '#7b4c37', rug: '#b9654c', wood: '#8d5b37', plants: '#4d8a47', pots: '#7b4c37' },
      'oak',
      V({ plants: 'lush' }),
      0.85,
    ),
  },
  {
    id: 'pastel',
    name: 'Pastel candy',
    design: design(
      'pastel',
      { walls: '#fbe9ef', floor: '#fff1f5', accent: '#f293b4', accent2: '#a9dccb', desks: '#fdf3e8', sofa: '#fde8f0', rug: '#ffdbe8', wood: '#f2d6c4', plants: '#90d09b', pots: '#f7c9d7' },
      'carpet',
      V({ sofa: 'straight' }),
      0.55,
    ),
  },
  {
    id: 'mono',
    name: 'Monochrome studio',
    design: design(
      'mono',
      { walls: '#e6e6e6', floor: '#c4c4c4', accent: '#3a3a3a', accent2: '#8d8d8d', desks: '#d6d6d6', sofa: '#d2d2d2', rug: '#a4a4a4', wood: '#b9b9b9', plants: '#5d7a5d', pots: '#f1f1f1' },
      'tiles',
      V({ rug: 'plain', plants: 'some' }),
      0.3,
    ),
  },
  {
    id: 'sunset',
    name: 'Desert sunset',
    design: design(
      'sunset',
      { walls: '#f4d6bb', floor: '#f6dcc3', accent: '#e0603a', accent2: '#6f9a9b', desks: '#f0d9bd', sofa: '#e9c9a6', rug: '#e8a178', wood: '#c58b5d', plants: '#7d9a55', pots: '#d9774b' },
      'mixed',
      V({ sofa: 'straight' }),
      0.75,
    ),
  },
  {
    id: 'ocean',
    name: 'Ocean breeze',
    design: design(
      'ocean',
      { walls: '#e3f0f4', floor: '#e9f3f6', accent: '#2f81aa', accent2: '#86c5b9', desks: '#f0f4f2', sofa: '#dbe9ee', rug: '#bcdbe6', wood: '#cdbf9f', plants: '#4f9c78', pots: '#d7e6e9' },
      'tiles',
      V({ rug: 'plain' }),
      0.35,
    ),
  },
]

export const THEME_IDS = THEMES.map(t => t.id)
export const DEFAULT_DESIGN = THEMES[0].design

const clone = d => JSON.parse(JSON.stringify(d))
export const themeDesign = id => clone((THEMES.find(t => t.id === id) || THEMES[0]).design)

const HEX = /^#[0-9a-f]{6}$/
const TOP = ['theme', 'colors', 'floor', 'variants', 'light', 'people']
export const PEOPLE_SIZE = { min: 0.7, max: 2 }

/**
 * Checks a design strictly: known keys only, colours '#rrggbb', styles from the fixed lists, a known theme id, light a
 * number from 0 to 1. A part left out falls back to the loft. Returns { ok: true, design } with a clean copy, or
 * { ok: false, error } with the reason in words.
 */
export function checkDesign(input) {
  const bad = error => ({ ok: false, error })
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('A design must be an object.')
  for (const k of Object.keys(input)) if (!TOP.includes(k)) return bad(`Unknown part "${k}".`)
  const out = clone(DEFAULT_DESIGN)
  if (input.theme !== undefined) {
    if (!THEME_IDS.includes(input.theme)) return bad(`Unknown theme "${String(input.theme).slice(0, 30)}".`)
    out.theme = input.theme
  }
  if (input.colors !== undefined) {
    const c = input.colors
    if (!c || typeof c !== 'object' || Array.isArray(c)) return bad('"colors" must be an object.')
    for (const [k, v] of Object.entries(c)) {
      if (!COLOR_KEYS.some(([key]) => key === k)) return bad(`Unknown colour "${k.slice(0, 30)}".`)
      if (typeof v !== 'string' || !HEX.test(v.toLowerCase())) return bad(`The colour "${k}" must look like #a1b2c3.`)
      out.colors[k] = v.toLowerCase()
    }
  }
  if (input.floor !== undefined) {
    if (!FLOORS.some(([f]) => f === input.floor)) return bad(`Unknown floor "${String(input.floor).slice(0, 30)}".`)
    out.floor = input.floor
  }
  if (input.variants !== undefined) {
    const v = input.variants
    if (!v || typeof v !== 'object' || Array.isArray(v)) return bad('"variants" must be an object.')
    for (const [k, val] of Object.entries(v)) {
      if (k === 'poster') {
        if (typeof val !== 'boolean') return bad('"poster" must be true or false.')
      } else if (!VARIANTS[k]) return bad(`Unknown furniture slot "${k.slice(0, 30)}".`)
      else if (!VARIANTS[k].some(([name]) => name === val)) return bad(`Unknown style "${String(val).slice(0, 30)}" for ${k}.`)
      out.variants[k] = val
    }
  }
  if (input.light !== undefined) {
    if (typeof input.light !== 'number' || !Number.isFinite(input.light) || input.light < 0 || input.light > 1) return bad('"light" must be a number from 0 to 1.')
    out.light = Math.round(input.light * 100) / 100
  }
  if (input.people !== undefined) {
    const n = input.people
    if (typeof n !== 'number' || !Number.isFinite(n) || n < PEOPLE_SIZE.min || n > PEOPLE_SIZE.max) return bad('"people" must be a number from 0.7 to 2.')
    out.people = Math.round(n * 100) / 100
  }
  return { ok: true, design: out }
}
