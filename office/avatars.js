// Character models for the studio's people: VRM files (glTF with a standard humanoid skeleton) that the person keeps
// in ~/.claude/studio-models, listed in that folder's models.json. The server hands them out under /models/.
//
// A loaded model becomes a "rig" with the same face as the chibi bodies in people.js: motion.js works out joint
// angles and `apply` turns them into rotations of the model's normalized humanoid bones (upper arm, lower arm, thigh,
// shin, spine, neck, head), sets its facial expressions (happy, sad, surprised...) and steps its hair and skirt
// springs. A plain .glb without a humanoid skeleton is shown as it is and moved as a whole.

import * as THREE from 'three'
import { GLTFLoader } from './vendor/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from './vendor/three-vrm.module.min.js'

/** The person's models.json, or null when there is none (the built-in chibi people are used then). */
export async function loadModelConfig() {
  try {
    const res = await fetch('/models/models.json', { cache: 'no-store' })
    if (!res.ok) return null
    const config = await res.json()
    const file = e => (typeof e === 'string' ? e : e?.file)
    const agents = Array.isArray(config.agents) ? config.agents : []
    // each model's persona (name tag, colour, about, speech lines), keyed by its file
    const personas = {}
    // each model's own size (0.7 to 2), keyed by its file
    const scales = {}
    for (const e of [config.claude, ...agents]) {
      const s = typeof e === 'object' ? Number(e?.scale) : NaN
      if (file(e) && Number.isFinite(s)) scales[file(e)] = Math.max(0.7, Math.min(2, s))
    }
    for (const e of [config.claude, ...agents]) if (file(e) && e?.persona && typeof e.persona === 'object') personas[file(e)] = e.persona
    // the agents who hang out in the lounge while not working: models.json's "lounge" list, or the first three
    // (the same rule as server-features/characters.mjs)
    const agentFiles = agents.map(file).filter(Boolean)
    const lounge = (Array.isArray(config.lounge) ? config.lounge.filter(f => typeof f === 'string') : agentFiles.slice(0, 3)).filter(f => agentFiles.includes(f))
    return {
      claude: file(config.claude) || null,
      agents: agentFiles,
      lounge,
      poster: file(config.poster) || null,
      credits: [config.claude, ...agents].map(e => e?.credit).filter(Boolean),
      personas,
      scales,
    }
  } catch {
    return null
  }
}

const buffers = new Map()
function fetchModel(file) {
  let p = buffers.get(file)
  if (!p) {
    p = fetch(`/models/${encodeURIComponent(file)}`).then(r => {
      if (!r.ok) throw new Error(`${file}: ${r.status}`)
      return r.arrayBuffer()
    })
    buffers.set(file, p)
  }
  return p
}
/** Starts downloading the models early, so people who walk in later do not wait for theirs. */
export function prefetchModels(config) {
  for (const f of [config.claude, ...config.agents]) if (f) fetchModel(f).catch(() => undefined)
}

const V = () => new THREE.Vector3()
/** The seat's height plus a little for the thighs: where the hip joints sit when someone sits down. */
const SEATED_HIP = 0.43
/** How high every model's head ends up (room units), so all of them stand about as tall as the chibi people. */
const HEAD_HEIGHT = 1.17
/** How far the arms come down from the model's T-pose before any pose is laid on top (radians). */
const ARMS_DOWN = 1.3

/**
 * Loads `file` and builds a rig for it. Each person gets a model of their own (parsed afresh from the shared
 * download), so springs and expressions never cross between two people wearing the same model.
 */
export async function vrmRig(file, id) {
  const buffer = await fetchModel(file)
  const loader = new GLTFLoader()
  loader.register(parser => new VRMLoaderPlugin(parser))
  const gltf = await loader.parseAsync(buffer, '/models/')
  const vrm = gltf.userData.vrm
  const model = vrm ? vrm.scene : gltf.scene
  if (vrm) {
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons?.(gltf.scene)
    VRMUtils.rotateVRM0(vrm)
    // hands on the head (stress, panic) would shove long hair aside: hair and skirts ignore the arms' colliders
    const arms = new Set(
      ['leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'].map(n => vrm.humanoid?.getRawBoneNode(n)).filter(Boolean),
    )
    const onArm = c => {
      for (let p = c?.parent; p; p = p.parent) if (arms.has(p)) return true
      return false
    }
    for (const joint of vrm.springBoneManager?.joints ?? []) {
      if (Array.isArray(joint.colliderGroups)) joint.colliderGroups = joint.colliderGroups.filter(g => !(g.colliders ?? []).some(onArm))
      // avatar hair is set up stiff for VR; softer and heavier, it falls down when the head bows instead of sticking out
      const s = joint.settings
      if (s) {
        s.stiffness *= 0.45
        s.gravityPower = Math.max(s.gravityPower ?? 0, 0.35)
        s.gravityDir?.set(0, -1, 0)
      }
    }
  }
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
      o.frustumCulled = false
      o.userData.personId = id
      // MToon's ink outlines are drawn as a second, inflated copy of the mesh: left out (cleaner and cheaper)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.isOutline) m.visible = false
    }
  })

  const object = new THREE.Group()
  const offset = new THREE.Group() // sinks the whole model while seated
  object.add(offset)
  offset.add(model)
  const bone = name => vrm?.humanoid?.getNormalizedBoneNode(name) ?? null
  // VRM 0.x models are built facing -z: angles meant for a model facing +z flip their x and z parts
  const flip = vrm?.meta?.metaVersion === '0' ? -1 : 1

  // measure the model in its rest pose and scale it so its head sits where a chibi person's does
  model.updateMatrixWorld(true)
  const at = name => (bone(name) ? bone(name).getWorldPosition(V()) : null)
  const box = new THREE.Box3().setFromObject(model)
  const knee = at('leftLowerLeg')?.y ?? (box.max.y - box.min.y) * 0.28
  const hip = at('leftUpperLeg')?.y ?? (box.max.y - box.min.y) * 0.5
  const headY = at('head')?.y ?? (box.max.y - box.min.y) * 0.85
  const scale = Math.max(0.5, Math.min(1.3, HEAD_HEIGHT / Math.max(0.2, headY)))
  model.scale.setScalar(scale)
  /** How far the hips sink to reach the seat. The person is also scaled around the feet (rig.size), so the seat's height is divided by it. */
  const dropFor = size => Math.max(0, hip * scale - SEATED_HIP / size)
  const drop = dropFor(1)
  const headBone = bone('head')
  const height = (box.max.y - box.min.y) * scale

  // prop holders in the hands: -y out along the fingers, +z forward, in room units whatever the model's scale
  const holder = side => {
    const handBone = bone(side === 'A' ? 'leftHand' : 'rightHand')
    if (!handBone) {
      const g = new THREE.Group()
      g.position.y = height * 0.45
      object.add(g)
      return g
    }
    const outer = new THREE.Group() // turns a +z-facing placement into the model's own frame
    outer.rotation.y = flip < 0 ? Math.PI : 0
    const place = new THREE.Group()
    place.position.set(side === 'A' ? 0.07 : -0.07, -0.01, 0)
    place.rotation.z = side === 'A' ? Math.PI / 2 : -Math.PI / 2
    const inner = new THREE.Group()
    inner.rotation.y = flip < 0 ? -Math.PI : 0
    inner.scale.setScalar(1 / scale)
    handBone.add(outer)
    outer.add(place)
    place.add(inner)
    return inner
  }
  const hands = { A: holder('A'), B: holder('B') }

  const setBone = (name, x, y, z) => {
    const b = bone(name)
    if (b) b.rotation.set(flip * x, y, flip * z)
  }
  const expressions = vrm?.expressionManager
  const hasExpression = name => !!expressions?.getExpression(name)
  let settled = false

  return {
    object,
    kind: 'vrm',
    /** The extra size from the room and the character settings; the page sets it every frame, and root.scale applies it. */
    size: 1,
    info: `s${scale.toFixed(2)} knee${knee.toFixed(2)} hip${hip.toFixed(2)} drop${drop.toFixed(2)} h${height.toFixed(2)} v${vrm?.meta?.metaVersion}`,
    hand: side => hands[side],
    anchor(out) {
      if (headBone) headBone.getWorldPosition(out)
      else object.getWorldPosition(out).setY(height)
      out.y += 0.36
      return out
    },
    head(out) {
      if (headBone) return headBone.getWorldPosition(out)
      return object.getWorldPosition(out).setY(height * 0.9)
    },
    /** Lets the hair and skirt springs start from where the person stands now, not from the room's centre. */
    settle() {
      settled = false
    },
    apply(J, bob, dt, face, closed) {
      const size = this.size || 1
      offset.position.y = -J.drop * dropFor(size) + bob
      if (!vrm) return
      setBone('spine', J.lean * 0.45, J.twist * 0.5, 0)
      setBone('chest', J.lean * 0.35, J.twist * 0.5, 0)
      setBone('upperChest', J.lean * 0.2, 0, 0)
      setBone('leftShoulder', 0, 0, -J.slump * 0.14)
      setBone('rightShoulder', 0, 0, J.slump * 0.14)
      setBone('leftUpperArm', J.aAx, 0, J.aAz - ARMS_DOWN)
      setBone('rightUpperArm', J.aBx, 0, J.aBz + ARMS_DOWN)
      setBone('leftLowerArm', 0, -J.eA, 0)
      setBone('rightLowerArm', 0, J.eB, 0)
      setBone('leftUpperLeg', J.tL, 0, 0)
      setBone('rightUpperLeg', J.tR, 0, 0)
      // longer legs than the chair is high: seated knees tuck a little further back
      const tuck = Math.max(0, knee * scale - SEATED_HIP / size) * 2.2 * J.drop
      setBone('leftLowerLeg', J.kL + tuck, 0, 0)
      setBone('rightLowerLeg', J.kR + tuck, 0, 0)
      setBone('leftFoot', -Math.min(0.5, Math.max(0, J.kL - 1.2)) * 0.4, 0, 0)
      setBone('rightFoot', -Math.min(0.5, Math.max(0, J.kR - 1.2)) * 0.4, 0, 0)
      setBone('neck', J.hX * 0.4, J.hY * 0.4, J.hZ * 0.4)
      setBone('head', J.hX * 0.6, J.hY * 0.6, J.hZ * 0.6)
      if (expressions) {
        for (const [name, w] of Object.entries(face)) if (hasExpression(name)) expressions.setValue(name, w)
        // a happy face already narrows the eyes; blinking on top of it closes them too far
        if (hasExpression('blink')) expressions.setValue('blink', Math.max(0, closed - face.happy * 0.6))
      }
      if (!settled) {
        object.updateWorldMatrix(true, true)
        vrm.update(0)
        vrm.springBoneManager?.reset()
        settled = true
      }
      vrm.update(Math.min(dt, 1 / 20))
    },
    dispose() {
      VRMUtils.deepDispose(model)
    },
  }
}
