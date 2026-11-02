// Little effects that float around the studio's people and desks: music notes, swirling question marks, sweat drops,
// steam from the ears, smoke, cartoon fire with glowing bugs in it, sprinkler water, extinguisher foam and confetti.
//
// Every particle is one point of one of two THREE.Points (one drawn normally, one added as light), so a room full of
// confetti still costs two draw calls. Each point picks its picture from a 4 x 4 atlas painted on a canvas at start.

import * as THREE from 'three'

/** Tiles of the atlas, by name. */
export const TILE = {
  note: 0,
  note2: 1,
  question: 2,
  sweat: 3,
  steam: 4,
  smoke: 5,
  flame: 6,
  bug: 7,
  confetti: 8,
  water: 9,
  foam: 10,
  star: 11,
  bang: 12,
  anger: 13,
  ember: 14,
  glow: 15,
}

const SIZE = 128

function atlasTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = SIZE * 4
  const g = c.getContext('2d')
  const at = (tile, draw) => {
    g.save()
    g.translate((tile % 4) * SIZE, Math.floor(tile / 4) * SIZE)
    draw()
    g.restore()
  }
  const glyph = (tile, text, px) =>
    at(tile, () => {
      g.font = `900 ${px}px "Segoe UI Symbol", "Segoe UI", sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.lineJoin = 'round'
      g.lineWidth = 12
      g.strokeStyle = 'rgba(58,40,40,0.9)'
      g.strokeText(text, 64, 68)
      g.fillStyle = '#ffffff'
      g.fillText(text, 64, 68)
    })
  const puff = (tile, inner, outer) =>
    at(tile, () => {
      for (const [x, y, r] of [
        [64, 70, 34],
        [42, 62, 24],
        [86, 60, 26],
        [58, 44, 24],
        [78, 82, 22],
      ]) {
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, inner)
        grad.addColorStop(0.7, inner)
        grad.addColorStop(1, outer)
        g.fillStyle = grad
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
    })
  const drop = (tile, body, shine, tall = 1) =>
    at(tile, () => {
      g.translate(64, 64)
      g.scale(1, tall)
      g.beginPath()
      g.moveTo(0, -46)
      g.bezierCurveTo(10, -22, 30, 0, 30, 18)
      g.arc(0, 18, 30, 0, Math.PI)
      g.bezierCurveTo(-30, 0, -10, -22, 0, -46)
      g.fillStyle = body
      g.fill()
      g.lineWidth = 5
      g.strokeStyle = 'rgba(40,70,110,0.55)'
      g.stroke()
      g.fillStyle = shine
      g.beginPath()
      g.ellipse(-10, 14, 7, 12, -0.4, 0, Math.PI * 2)
      g.fill()
    })

  glyph(TILE.note, '♪', 104)
  glyph(TILE.note2, '♫', 100)
  glyph(TILE.question, '?', 110)
  drop(TILE.sweat, '#bfe6ff', 'rgba(255,255,255,0.9)')
  puff(TILE.steam, 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)')
  puff(TILE.smoke, 'rgba(120,112,108,0.9)', 'rgba(120,112,108,0)')
  at(TILE.flame, () => {
    // a cartoon flame: a hot yellow heart in an orange tongue with a red rim
    g.translate(64, 70)
    const tongue = (s, col) => {
      g.save()
      g.scale(s, s)
      g.beginPath()
      g.moveTo(0, -58)
      g.bezierCurveTo(14, -30, 40, -12, 36, 16)
      g.bezierCurveTo(32, 42, -32, 42, -36, 16)
      g.bezierCurveTo(-40, -8, -12, -24, 0, -58)
      g.fillStyle = col
      g.fill()
      g.restore()
    }
    tongue(1.04, 'rgba(214,52,30,0.95)')
    tongue(0.92, 'rgba(255,96,30,1)')
    tongue(0.66, 'rgba(255,165,40,1)')
    tongue(0.38, 'rgba(255,238,140,1)')
  })
  at(TILE.bug, () => {
    // a glowing little bug: the kind that lives in failing code
    g.translate(64, 66)
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, 60)
    glow.addColorStop(0, 'rgba(190,255,120,0.75)')
    glow.addColorStop(1, 'rgba(190,255,120,0)')
    g.fillStyle = glow
    g.fillRect(-64, -64, 128, 128)
    g.strokeStyle = '#3a2620'
    g.lineWidth = 5
    g.lineCap = 'round'
    for (const s of [-1, 1])
      for (const [y, dx] of [
        [-8, 30],
        [6, 34],
        [20, 28],
      ]) {
        g.beginPath()
        g.moveTo(s * 10, y)
        g.lineTo(s * dx, y + 8)
        g.stroke()
      }
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(s * 5, -24)
      g.quadraticCurveTo(s * 14, -40, s * 22, -40)
      g.stroke()
    }
    g.fillStyle = '#d9473a'
    g.beginPath()
    g.ellipse(0, 6, 22, 26, 0, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.fillStyle = '#3a2620'
    g.beginPath()
    g.arc(0, -20, 12, 0, Math.PI * 2)
    g.fill()
    g.fillRect(-1.5, -14, 3, 46)
    for (const [x, y] of [
      [-10, 0],
      [11, 4],
      [-8, 18],
      [9, 20],
    ]) {
      g.beginPath()
      g.arc(x, y, 4, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#fff'
    for (const s of [-1, 1]) {
      g.beginPath()
      g.arc(s * 5, -22, 3, 0, Math.PI * 2)
      g.fill()
    }
  })
  at(TILE.confetti, () => {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.roundRect(40, 24, 48, 80, 8)
    g.fill()
  })
  drop(TILE.water, '#9fd0f5', 'rgba(255,255,255,0.8)', 1.0)
  puff(TILE.foam, 'rgba(250,252,255,0.97)', 'rgba(225,238,250,0)')
  at(TILE.star, () => {
    g.translate(64, 64)
    g.fillStyle = '#ffffff'
    g.beginPath()
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 12 : 54
      const a = (i / 8) * Math.PI * 2
      g.lineTo(Math.sin(a) * r, -Math.cos(a) * r)
    }
    g.fill()
  })
  glyph(TILE.bang, '!', 112)
  at(TILE.anger, () => {
    // the anime "annoyed" mark: four red curved veins
    g.translate(64, 64)
    g.strokeStyle = '#e8473f'
    g.lineWidth = 13
    g.lineCap = 'round'
    for (let i = 0; i < 4; i++) {
      g.save()
      g.rotate((i * Math.PI) / 2 + Math.PI / 4)
      g.beginPath()
      g.moveTo(10, -40)
      g.quadraticCurveTo(12, -12, 40, -10)
      g.stroke()
      g.restore()
    }
  })
  at(TILE.ember, () => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 30)
    grad.addColorStop(0, 'rgba(255,240,180,1)')
    grad.addColorStop(0.5, 'rgba(255,150,60,0.9)')
    grad.addColorStop(1, 'rgba(255,90,30,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, SIZE, SIZE)
  })
  at(TILE.glow, () => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, SIZE, SIZE)
  })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const VERT = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  attribute float spin;
  attribute float tile;
  uniform float scale;
  varying vec4 vTint;
  varying float vSpin;
  varying float vTile;
  void main() {
    vTint = tint;
    vSpin = spin;
    vTile = tile;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale;
  }
`
const FRAG = /* glsl */ `
  uniform sampler2D atlas;
  varying vec4 vTint;
  varying float vSpin;
  varying float vTile;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vSpin);
    float s = sin(vSpin);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
    float col = mod(vTile, 4.0);
    float row = floor(vTile / 4.0);
    vec2 uv = vec2((col + p.x) / 4.0, 1.0 - (row + p.y) / 4.0);
    vec4 tex = texture2D(atlas, uv);
    vec4 outc = tex * vTint;
    if (outc.a < 0.01) discard;
    gl_FragColor = outc;
    #include <colorspace_fragment>
  }
`

const CAPACITY = 1400

function makeLayer(atlas, additive) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(CAPACITY * 3)
  const size = new Float32Array(CAPACITY)
  const tint = new Float32Array(CAPACITY * 4)
  const spin = new Float32Array(CAPACITY)
  const tile = new Float32Array(CAPACITY)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 4).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('spin', new THREE.BufferAttribute(spin, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('tile', new THREE.BufferAttribute(tile, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setDrawRange(0, 0)
  const material = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: atlas }, scale: { value: 100 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  points.renderOrder = additive ? 6 : 5
  return { points, geo, pos, size, tint, spin, tile, material, list: [] }
}

const tmpColor = new THREE.Color()

/**
 * The effects layer. `emit(kind, at, options)` starts one particle; `update(dt, camera, height)` moves them all and
 * redraws. Sizes are in room units, so effects grow and shrink with the zoom like everything else.
 */
export function makeFx(scene) {
  const atlas = atlasTexture()
  const normal = makeLayer(atlas, false)
  const glow = makeLayer(atlas, true)
  scene.add(normal.points, glow.points)

  /**
   * One particle. Options: vel [x,y,z], gravity, drag, life (s), size, grow (size at the end), color, alpha, fade
   * ('out' or 'inout'), spin, spinRate, wobble (sideways sway), orbit {r, rate} around the start point, additive.
   */
  function emit(tile, at, o = {}) {
    const layer = o.additive ? glow : normal
    if (layer.list.length >= CAPACITY) layer.list.shift()
    tmpColor.set(o.color ?? 0xffffff)
    layer.list.push({
      tile,
      x: at.x,
      y: at.y,
      z: at.z,
      ox: at.x,
      oz: at.z,
      vx: o.vel?.[0] ?? 0,
      vy: o.vel?.[1] ?? 0,
      vz: o.vel?.[2] ?? 0,
      g: o.gravity ?? 0,
      drag: o.drag ?? 0,
      age: 0,
      life: o.life ?? 1.5,
      s0: o.size ?? 0.2,
      s1: o.grow ?? o.size ?? 0.2,
      r: tmpColor.r,
      gr: tmpColor.g,
      b: tmpColor.b,
      a: o.alpha ?? 1,
      fade: o.fade ?? 'out',
      rot: o.spin ?? 0,
      rotRate: o.spinRate ?? 0,
      wobble: o.wobble ?? 0,
      orbit: o.orbit ?? null,
      phase: Math.random() * 6.28,
    })
  }

  function step(layer, dt) {
    const keep = []
    for (const p of layer.list) {
      p.age += dt
      if (p.age >= p.life) continue
      p.vy -= p.g * dt
      if (p.drag) {
        const k = Math.exp(-p.drag * dt)
        p.vx *= k
        p.vy *= k
        p.vz *= k
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.rot += p.rotRate * dt
      keep.push(p)
    }
    layer.list = keep
    let i = 0
    for (const p of keep) {
      const u = p.age / p.life
      let x = p.x
      let z = p.z
      if (p.orbit) {
        const a = p.phase + p.age * p.orbit.rate
        x = p.ox + Math.cos(a) * p.orbit.r + (p.x - p.ox)
        z = p.oz + Math.sin(a) * p.orbit.r + (p.z - p.oz)
      }
      if (p.wobble) x += Math.sin(p.phase + p.age * 4) * p.wobble
      layer.pos[i * 3] = x
      layer.pos[i * 3 + 1] = p.y
      layer.pos[i * 3 + 2] = z
      layer.size[i] = p.s0 + (p.s1 - p.s0) * u
      const fade = p.fade === 'inout' ? Math.min(1, u * 6, (1 - u) * 3) : Math.min(1, (1 - u) * 2.5)
      layer.tint[i * 4] = p.r
      layer.tint[i * 4 + 1] = p.gr
      layer.tint[i * 4 + 2] = p.b
      layer.tint[i * 4 + 3] = p.a * fade
      layer.spin[i] = p.rot
      layer.tile[i] = p.tile
      i++
    }
    layer.geo.setDrawRange(0, i)
    for (const name of ['position', 'size', 'tint', 'spin', 'tile']) layer.geo.attributes[name].needsUpdate = true
  }

  return {
    emit,
    /** A burst of confetti and sparkles, for a passing test or a finished task. */
    confetti(at, count = 70) {
      const colours = [0xff5c8a, 0xffc94a, 0x6fd3a5, 0x7fb8ff, 0xc39bff, 0xff8f5c]
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = 0.8 + Math.random() * 1.8
        emit(TILE.confetti, at, {
          vel: [Math.cos(a) * sp, 2.6 + Math.random() * 2.2, Math.sin(a) * sp],
          gravity: 4.2,
          drag: 1.4,
          life: 2.2 + Math.random() * 1.2,
          size: 0.09 + Math.random() * 0.05,
          color: colours[i % colours.length],
          spin: Math.random() * 6,
          spinRate: (Math.random() - 0.5) * 18,
          wobble: 0.05,
        })
      }
      for (let i = 0; i < 12; i++)
        emit(TILE.star, at, {
          vel: [(Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2],
          drag: 2,
          life: 0.9,
          size: 0.22,
          grow: 0.05,
          color: 0xfff1a8,
          additive: true,
          spinRate: 4,
        })
    },
    /** Called once a frame; `pixelsPerUnit` turns room units into screen pixels. */
    update(dt, pixelsPerUnit) {
      normal.material.uniforms.scale.value = pixelsPerUnit
      glow.material.uniforms.scale.value = pixelsPerUnit
      step(normal, dt)
      step(glow, dt)
    },
    count: () => normal.list.length + glow.list.length,
  }
}
