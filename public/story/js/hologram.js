/**
 * hologram.js — the 3D holographic couple scene.
 *
 * Builds a Three.js scene containing two translucent human figures standing on
 * a glowing circular platform, plus the particles, reflection and background
 * that sell the "projection hovering in the dark" feeling.
 *
 * This module owns the *scene* only. The scroll choreography lives in
 * hologramAnimation.js and the pointer parallax in hologramInteraction.js, so
 * each piece stays readable on its own.
 *
 * The figures are built procedurally from primitives rather than loaded from
 * GLB files. That is a deliberate choice, not a placeholder: a hologram reads
 * as an elegant *silhouette*, so smooth capsules and a lathed dress look more
 * like a projection than a low-poly game character would, and they cost a few
 * kilobytes instead of a few megabytes on a page people open on phones.
 * If you later want real models, drop them in assets/3d/ and see
 * loadHologramCharacters() — the hook is already there.
 */

import * as THREE from "./vendor/three.module.min.js";

/* ------------------------------------------------------------------ *
 * Quality tiers
 * ------------------------------------------------------------------ */

/**
 * Picks a quality tier from the device. Phones get fewer particles, no
 * reflection pass and a cheaper shader — the scroll must stay smooth even if
 * that costs some sparkle, because a janky scroll ruins the moment far more
 * than a slightly dimmer glow does.
 */
export function detectQuality() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 820;
  const cores = navigator.hardwareConcurrency || 4;
  const mobile = coarse || narrow;
  const weak = mobile && cores <= 4;

  return {
    mobile,
    pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2),
    // Segment counts feed every geometry; halving them on phones roughly
    // quarters the triangle count across two full figures.
    seg: weak ? 10 : mobile ? 14 : 24,
    dustCount: weak ? 70 : mobile ? 120 : 260,
    starCount: weak ? 40 : mobile ? 70 : 150,
    sparkCount: weak ? 18 : mobile ? 28 : 64,
    reflection: !mobile,
    // The rim shell is a second pass over both bodies. Worth it on desktop,
    // first thing to go on a phone.
    rimShell: !weak,
  };
}

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */

const HOLO_VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPosW;
  varying float vLocalY;

  void main() {
    vLocalY = position.y;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const HOLO_FRAG = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform float uOpacity;     // master fade — drives the whole reveal
  uniform float uPulse;       // 0..1 light pulse travelling up the body
  uniform float uFlicker;     // per-figure flicker amount
  uniform vec3  uCore;        // body colour
  uniform vec3  uRim;         // edge colour
  uniform float uScanDensity;
  uniform float uCheap;       // 1.0 = skip the noise octaves (low-end devices)

  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPosW;
  varying float vLocalY;

  // Cheap value noise — enough to keep the surface alive without looking
  // like TV static.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vViewDir);

    // Fresnel: edges glow, the centre stays glassy and see-through. This is
    // the single effect that makes it read as a hologram rather than blue
    // plastic, so it carries most of the weight.
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 2.6);

    // Horizontal scanlines in world space, drifting slowly upward.
    float scan = sin(vPosW.y * uScanDensity - uTime * 1.6) * 0.5 + 0.5;
    scan = mix(0.82, 1.0, scan);

    // A brighter band that sweeps up the body every few seconds.
    float pulseBand = smoothstep(0.16, 0.0, abs(vLocalY - (uPulse * 2.4 - 0.4)));

    float grain = 1.0;
    if (uCheap < 0.5) {
      grain = mix(0.88, 1.06, noise(vPosW.xy * 7.0 + uTime * 0.35));
    }

    // Body stays translucent, but not so faint that the background competes
    // with it — the couple must read as the brightest thing on screen.
    float body = 0.30 + fresnel * 1.05 + pulseBand * 0.40;
    body *= scan * grain * uFlicker;

    vec3 col = mix(uCore, uRim, clamp(fresnel * 1.15 + pulseBand * 0.5, 0.0, 1.0));
    col += uRim * pulseBand * 0.45;

    float alpha = clamp(body, 0.0, 1.0) * uOpacity;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(col * (0.75 + fresnel * 0.9), alpha);
  }
`;

/**
 * Creates the hologram body material.
 *
 * depthWrite is off so the two figures read as translucent volumes that
 * overlap rather than as solids that clip into each other when they embrace.
 */
export function createHologramMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uPulse: { value: 0 },
      uFlicker: { value: 1 },
      uCore: { value: new THREE.Color(opts.core || "#4fd8ff") },
      uRim: { value: new THREE.Color(opts.rim || "#b58bff") },
      uScanDensity: { value: opts.scanDensity || 46 },
      uCheap: { value: opts.cheap ? 1 : 0 },
    },
  });
}

/** Additive outer shell that gives the bodies a volumetric halo. */
function createRimShellMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: {
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform float uOpacity; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.2);
        gl_FragColor = vec4(uColor, f * uOpacity * 0.5);
      }
    `,
  });
}

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

/**
 * Builds one figure as a named joint hierarchy so the animation module can
 * pose it without knowing how the body was constructed.
 *
 * Every limb hangs from a pivot group positioned at the joint, with the mesh
 * offset *below* the pivot — rotating the group then swings the limb from the
 * shoulder or hip the way a real one does, instead of spinning it about its
 * own middle.
 *
 * The clothing is what makes these read as people rather than mannequins, and
 * it is built the same way a tailor thinks about it: a single lathed profile
 * per garment, turned from a list of (radius, height) points running from hem
 * to collar. A lathe gives a continuous, believably draped surface — a jacket
 * that nips in at the waist and broadens across the chest, a gown that falls
 * from a fitted bodice into a full skirt — which a stack of capsules can
 * never do. Each profile is then flattened on Z, because a person seen from
 * the side is much narrower than one seen from the front, and an unflattened
 * lathe reads as a vase.
 */
function buildFigure(kind, q, material) {
  const seg = q.seg;
  const root = new THREE.Group();
  const meshes = [];
  const female = kind === "female";
  const scale = female ? 0.95 : 1.0;

  const add = (geo, parent, y = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.y = y;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  // Landmark heights, in figure units before `scale`. Kept as one table so the
  // proportions can be read at a glance and stay anatomically sane: roughly
  // seven-and-a-half heads tall, waist a little above the midpoint.
  const H = {
    ankle: 0.09,
    knee: 0.47,
    hip: 0.88,
    waist: 1.02,
    chest: 1.26,
    shoulder: 1.44,
    neck: 1.53,
    head: 1.66,
  };

  const lathe = (pts, parent, y = 0, segs = seg) =>
    add(new THREE.LatheGeometry(pts.map(([r, py]) => new THREE.Vector2(Math.max(0.004, r) * scale, py * scale)), segs), parent, y);

  // ---- torso group, pivoted at the waist ----
  const torso = new THREE.Group();
  torso.position.y = H.waist * scale;
  root.add(torso);

  const shoulderX = (female ? 0.113 : 0.172) * scale;

  let chest;
  let dress = null;

  if (female) {
    // Fitted bodice: waist to shoulder, following the ribcage.
    chest = lathe([
      [0.126, 0.00], [0.134, 0.06], [0.145, 0.13], [0.150, 0.20],
      [0.148, 0.27], [0.144, 0.34], [0.130, 0.40], [0.092, 0.45], [0.058, 0.50],
    ], torso, 0);
    chest.scale.set(1, 1, 0.80);

    // The gown. Held separately from the bodice so the dance can sway and
    // flare the skirt without squashing her upper body when she breathes.
    dress = lathe([
      [0.128, 0.00], [0.146, -0.09], [0.159, -0.19], [0.170, -0.30],
      [0.186, -0.44], [0.212, -0.60], [0.248, -0.76], [0.288, -0.90],
      [0.318, -0.99], [0.324, -1.02],
    ], torso, 0, Math.max(16, seg));
    dress.scale.set(1, 1, 0.88);

    // A soft waist seam where bodice meets skirt.
    const seam = add(new THREE.TorusGeometry(0.128 * scale, 0.011 * scale, 6, Math.max(14, seg)), torso, 0);
    seam.rotation.x = Math.PI / 2;
    seam.scale.set(1, 0.84, 1);
  } else {
    // Suit jacket: hem below the waist, nipped at the waist, broad across the
    // chest, sloping into the shoulders.
    chest = lathe([
      [0.182, -0.20], [0.180, -0.13], [0.174, -0.05], [0.172, 0.00],
      [0.184, 0.08], [0.197, 0.17], [0.204, 0.26], [0.201, 0.34],
      [0.180, 0.41], [0.128, 0.46], [0.070, 0.50],
    ], torso, 0);
    chest.scale.set(1, 1, 0.64);

    // Lapels: two slim panels meeting in a V at the sternum. Small, but it is
    // the detail that says "jacket" rather than "jumper".
    [-1, 1].forEach((side) => {
      const lapel = add(new THREE.BoxGeometry(0.052 * scale, 0.19 * scale, 0.010 * scale), torso, 0.30 * scale);
      lapel.position.x = side * 0.058 * scale;
      lapel.position.z = 0.116 * scale;
      lapel.rotation.z = side * 0.34;
    });

    // Collar band at the neck.
    const collar = add(new THREE.TorusGeometry(0.068 * scale, 0.013 * scale, 6, Math.max(12, seg)), torso, 0.49 * scale);
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(1, 0.7, 1);
  }

  // Shoulder caps soften the join between sleeve and body.
  [-1, 1].forEach((side) => {
    const cap = add(new THREE.SphereGeometry((female ? 0.054 : 0.068) * scale, Math.max(8, seg * 0.6), Math.max(6, seg * 0.45)), torso, (H.shoulder - H.waist) * scale);
    cap.position.x = side * shoulderX;
    cap.scale.set(1.15, 0.82, 0.8);
  });

  // ---- neck and head ----
  const neck = new THREE.Group();
  neck.position.y = (H.neck - H.waist) * scale;
  torso.add(neck);

  const throat = add(new THREE.CylinderGeometry(0.042 * scale, 0.050 * scale, 0.08 * scale, Math.max(8, seg * 0.5)), neck, 0.02 * scale);
  throat.scale.set(1, 1, 0.9);

  // Head: an egg rather than a ball — slightly taller than wide, narrowing at
  // the jaw, which is most of what makes a head read as a head.
  const head = add(new THREE.SphereGeometry(0.098 * scale, seg, Math.max(8, seg * 0.7)), neck, 0.125 * scale);
  head.scale.set(0.92, 1.12, 0.94);

  // Hair.
  if (female) {
    // A curtain falling to the shoulders, pushed behind the face so it frames
    // rather than covers it (a lathe is radially symmetric, so left alone it
    // would fall across her features too).
    const hair = lathe([
      [0.052, 0.235], [0.088, 0.205], [0.106, 0.160], [0.112, 0.100],
      [0.110, 0.030], [0.104, -0.040], [0.092, -0.110], [0.070, -0.160],
    ], neck, 0, Math.max(12, seg));
    hair.position.z = -0.022 * scale;
    hair.scale.set(0.98, 1, 1.14);

    // A low chignon at the nape — reads as "dressed up" from any angle.
    const bun = add(new THREE.SphereGeometry(0.046 * scale, Math.max(8, seg * 0.5), Math.max(6, seg * 0.4)), neck, 0.105 * scale);
    bun.position.z = -0.086 * scale;
    bun.scale.set(1, 0.86, 0.9);
  } else {
    // A neat crown that hugs the skull.
    const pts = [];
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * 1.42;
      pts.push([0.104 * Math.sin(a), 0.125 + 0.104 * Math.cos(a)]);
    }
    const hair = lathe(pts, neck, 0);
    hair.scale.set(0.99, 1.04, 1.02);
  }

  // ---- arms ----
  // Tapered: a sleeve is wider at the shoulder than at the cuff. Uniform
  // capsules are the single biggest giveaway of a programmer-built body.
  const upperLen = 0.30;
  const foreLen = 0.28;

  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * shoulderX, (H.shoulder - H.waist) * scale, 0);
    torso.add(shoulder);

    const rShoulder = (female ? 0.055 : 0.066) * scale;
    const rElbow = (female ? 0.042 : 0.050) * scale;
    const rWrist = (female ? 0.030 : 0.035) * scale;

    add(new THREE.CylinderGeometry(rShoulder, rElbow, upperLen * scale, Math.max(7, seg * 0.5)), shoulder, (-upperLen / 2) * scale);

    const elbow = new THREE.Group();
    elbow.position.y = -upperLen * scale;
    shoulder.add(elbow);
    add(new THREE.SphereGeometry(rElbow * 0.92, Math.max(7, seg * 0.45), Math.max(5, seg * 0.35)), elbow, 0);
    add(new THREE.CylinderGeometry(rElbow, rWrist, foreLen * scale, Math.max(7, seg * 0.5)), elbow, (-foreLen / 2) * scale);

    // Explicit hand node: the hand-holding effect reads its world position
    // from here, which is far more reliable than recomputing the kinematics.
    const hand = new THREE.Group();
    hand.position.y = -foreLen * scale;
    elbow.add(hand);
    const palm = add(new THREE.SphereGeometry(rWrist * 1.08, Math.max(7, seg * 0.45), Math.max(5, seg * 0.35)), hand, -0.016 * scale);
    palm.scale.set(1, 1.35, 0.62);

    return { shoulder, elbow, hand };
  };

  const armL = makeArm(-1);
  const armR = makeArm(1);

  // ---- legs ----
  const thighLen = H.hip - H.knee;
  const shinLen = H.knee - H.ankle;

  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.072 * scale, (H.hip - H.waist) * scale, 0);
    torso.add(hip);

    const knee = new THREE.Group();
    knee.position.y = -thighLen * scale;
    hip.add(knee);

    // Her gown covers the legs completely, so they are joints only. Drawing
    // them would only show shins through the skirt, which is exactly what
    // made the first attempt look wrong.
    if (!female) {
      // Trouser leg: a gentle taper from thigh to ankle.
      add(new THREE.CylinderGeometry(0.083 * scale, 0.068 * scale, thighLen * scale, Math.max(7, seg * 0.5)), hip, (-thighLen / 2) * scale);
      add(new THREE.CylinderGeometry(0.068 * scale, 0.055 * scale, shinLen * scale, Math.max(7, seg * 0.5)), knee, (-shinLen / 2) * scale);

      // Shoe.
      const shoe = add(new THREE.SphereGeometry(0.062 * scale, Math.max(7, seg * 0.45), Math.max(5, seg * 0.35)), knee, -shinLen * scale);
      shoe.scale.set(0.95, 0.5, 1.7);
      shoe.position.z = 0.026 * scale;
    }

    return { hip, knee };
  };

  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Seat / hips under the jacket, so the trousers do not appear to hang off
  // nothing.
  if (!female) {
    const seat = lathe([
      [0.150, 0.00], [0.162, -0.06], [0.158, -0.12], [0.130, -0.17],
    ], torso, 0);
    seat.scale.set(1, 1, 0.72);
  }

  return {
    root,
    torso,
    neck,
    chest,
    armL,
    armR,
    legL,
    legR,
    dress,
    meshes,
    scale,
  };
}

/**
 * Hook for real GLB characters.
 *
 * Nothing in the repo ships .glb files today, so this resolves to the
 * procedural figures. When you add assets/3d/male-hologram.glb and
 * female-hologram.glb, load them here, re-assign the hologram material onto
 * their meshes and return the same joint-shaped object; the animation module
 * needs no changes. Keep them Draco- or Meshopt-compressed — this page is
 * opened on phones over mobile data.
 */
export async function loadHologramCharacters(q, materials, urls = {}) {
  const male = buildFigure("male", q, materials.male);
  const female = buildFigure("female", q, materials.female);

  if (!urls.male && !urls.female) return { male, female, source: "procedural" };

  try {
    const { GLTFLoader } = await import("./vendor/GLTFLoader.module.js");
    const loader = new GLTFLoader();
    const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
    const [mg, fg] = await Promise.all([load(urls.male), load(urls.female)]);
    male.root.clear();
    female.root.clear();
    mg.scene.traverse((o) => { if (o.isMesh) o.material = materials.male; });
    fg.scene.traverse((o) => { if (o.isMesh) o.material = materials.female; });
    male.root.add(mg.scene);
    female.root.add(fg.scene);
    return { male, female, source: "gltf" };
  } catch (err) {
    // A missing or broken model must never leave an empty stage — fall back
    // to the procedural figures we already built.
    console.warn("[hologram] GLB load failed, using procedural figures:", err);
    return { male, female, source: "procedural-fallback" };
  }
}

/* ------------------------------------------------------------------ *
 * Stage: floor, particles, stars
 * ------------------------------------------------------------------ */

function buildFloor(q) {
  const group = new THREE.Group();

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uEnergy: { value: 0 },   // rises when they dance
      uFootL: { value: new THREE.Vector2(-1, 0) },
      uFootR: { value: new THREE.Vector2(1, 0) },
      uStep: { value: 0 },
      uColor: { value: new THREE.Color("#3ea8ff") },
      uAccent: { value: new THREE.Color("#a97bff") },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUvC;
      void main() {
        vUvC = (uv - 0.5) * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform float uTime, uOpacity, uEnergy, uStep;
      uniform vec2 uFootL, uFootR;
      uniform vec3 uColor, uAccent;
      varying vec2 vUvC;

      void main() {
        float d = length(vUvC);
        if (d > 1.0) discard;

        // Radial falloff — bright at the centre, dissolving at the rim.
        float glow = smoothstep(1.0, 0.05, d) * 0.5;

        // Concentric rings drifting outward.
        float rings = sin(d * 26.0 - uTime * 1.1) * 0.5 + 0.5;
        glow += rings * 0.1 * smoothstep(1.0, 0.2, d);

        // Outer edge ring keeps the platform reading as a disc.
        glow += smoothstep(0.03, 0.0, abs(d - 0.93)) * 0.55;

        // Waves under each foot, only while they are actually moving.
        float step1 = smoothstep(0.26, 0.0, abs(length(vUvC - uFootL) - fract(uStep) * 0.5));
        float step2 = smoothstep(0.26, 0.0, abs(length(vUvC - uFootR) - fract(uStep + 0.5) * 0.5));
        glow += (step1 + step2) * 0.3 * uEnergy * (1.0 - fract(uStep));

        vec3 col = mix(uColor, uAccent, smoothstep(0.2, 1.0, d));
        gl_FragColor = vec4(col * (1.0 + uEnergy * 0.5), glow * uOpacity);
      }
    `,
  });

  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, Math.max(24, q.seg * 2)), mat);
  disc.rotation.x = -Math.PI / 2;
  group.add(disc);

  return { group, mat };
}

/** Particles rising from the platform. */
function buildDust(q) {
  const n = q.dustCount;
  const pos = new Float32Array(n * 3);
  const seedArr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 2.3;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 3.2;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seedArr[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seedArr, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSize: { value: q.mobile ? 26 : 34 },
      uColor: { value: new THREE.Color("#8fe3ff") },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uSize;
      varying float vA;
      void main() {
        vec3 p = position;
        // Rise and wrap. Each mote gets its own speed from its seed so the
        // field never pulses in unison.
        float speed = 0.06 + aSeed * 0.12;
        p.y = mod(p.y + uTime * speed, 3.4);
        p.x += sin(uTime * 0.25 + aSeed * 30.0) * 0.08;
        p.z += cos(uTime * 0.21 + aSeed * 21.0) * 0.08;
        // Fade in near the floor, out near the top.
        vA = smoothstep(0.0, 0.5, p.y) * smoothstep(3.4, 1.9, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (1.0 / -mv.z) * (0.5 + aSeed);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform float uOpacity; uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * vA * uOpacity;
        gl_FragColor = vec4(uColor, a * 0.38);
      }
    `,
  });

  return { points: new THREE.Points(geo, mat), mat };
}

/** Distant stars behind the stage. */
function buildStars(q) {
  const n = q.starCount;
  const pos = new Float32Array(n * 3);
  const seedArr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 1] = Math.random() * 12 - 1;
    pos[i * 3 + 2] = -11 - Math.random() * 16;
    seedArr[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seedArr, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color("#cfe4ff") },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vTw;
      void main() {
        vTw = 0.45 + 0.55 * (sin(uTime * (0.4 + aSeed) + aSeed * 40.0) * 0.5 + 0.5);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.2 + aSeed * 2.0) * (60.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform float uOpacity; uniform vec3 uColor;
      varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vTw * uOpacity * 0.22);
      }
    `,
  });

  return { points: new THREE.Points(geo, mat), mat };
}

/* ------------------------------------------------------------------ *
 * Scene assembly
 * ------------------------------------------------------------------ */

/** True when the browser can actually give us a WebGL context. */
export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

/**
 * Builds the whole scene and returns a handle the other modules drive.
 * Does not start a render loop — hologramAnimation.js owns that, so scroll
 * and rendering can never disagree about whose frame it is.
 */
export async function initHologramScene(canvas, opts = {}) {
  const q = opts.quality || detectQuality();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !q.mobile,
    alpha: true,
    powerPreference: "high-performance",
    // The section sits on a CSS gradient; premultiplied alpha keeps the
    // additive glow from washing that out at the edges.
    premultipliedAlpha: true,
  });
  renderer.setPixelRatio(q.pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.5, 6.4);

  const materials = {
    male: createHologramMaterial({ core: "#3fd2ff", rim: "#8fb4ff", cheap: !q.rimShell }),
    female: createHologramMaterial({ core: "#67c8ff", rim: "#c79bff", cheap: !q.rimShell }),
  };

  const { male, female, source } = await loadHologramCharacters(q, materials, opts.models || {});

  const stage = new THREE.Group();
  scene.add(stage);

  // Figures start apart and facing forward; the pose function takes over from
  // the first frame.
  male.root.position.set(-1.55, 0, 0);
  female.root.position.set(1.55, 0, 0);
  stage.add(male.root, female.root);

  // Optional additive shells for volumetric glow.
  const shells = [];
  if (q.rimShell) {
    [[male, "#7fd8ff"], [female, "#c9a4ff"]].forEach(([fig, col]) => {
      const shellMat = createRimShellMaterial(col);
      fig.meshes.forEach((m) => {
        const s = new THREE.Mesh(m.geometry, shellMat);
        s.scale.setScalar(1.06);
        m.add(s);
      });
      shells.push(shellMat);
    });
  }

  // Reflection: a squashed, flipped copy under the floor. Far cheaper than a
  // real reflection pass and, at this opacity, indistinguishable.
  let reflection = null;
  if (q.reflection) {
    reflection = new THREE.Group();
    reflection.scale.set(1, -1, 1);
    reflection.position.y = -0.02;
    const rm = createHologramMaterial({ core: "#2a86b8", rim: "#6f5fa8", cheap: true });
    rm.uniforms.uScanDensity.value = 30;
    [male, female].forEach((fig) => {
      fig.meshes.forEach((m) => {
        const r = new THREE.Mesh(m.geometry, rm);
        // Mirror the joint's world transform by parenting to the same node —
        // the group-level Y flip does the rest.
        m.getWorldPosition(r.position);
        reflection.add(r);
      });
    });
    // The mirrored meshes need to follow the joints, so we re-sync them each
    // frame in syncReflection() rather than parenting (which would inherit
    // the flip twice).
    reflection.userData.pairs = [];
    let i = 0;
    [male, female].forEach((fig) => {
      fig.meshes.forEach((m) => {
        reflection.userData.pairs.push([m, reflection.children[i++]]);
      });
    });
    reflection.userData.mat = rm;
    scene.add(reflection);
  }

  const floor = buildFloor(q);
  scene.add(floor.group);

  const dust = buildDust(q);
  scene.add(dust.points);

  const stars = buildStars(q);
  scene.add(stars.points);

  // Hand-holding effect lives in its own module but needs nodes here.
  const handFx = buildHandFx(q);
  scene.add(handFx.group);

  const handle = {
    THREE,
    renderer,
    scene,
    camera,
    stage,
    male,
    female,
    materials,
    shells,
    reflection,
    floor,
    dust,
    stars,
    handFx,
    quality: q,
    source,
    canvas,
  };

  resizeHologram(handle);
  return handle;
}

/** The light burst, ring and sparks that fire when their hands meet. */
function buildHandFx(q) {
  const group = new THREE.Group();

  // Soft circular energy wave.
  const ringMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color("#ffeccd") },
    },
    vertexShader: `varying vec2 vUvC; void main(){ vUvC=(uv-0.5)*2.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform float uProgress; uniform vec3 uColor;
      varying vec2 vUvC;
      void main() {
        float d = length(vUvC);
        // A thin ring expanding outward and fading as it goes.
        float r = uProgress;
        float band = smoothstep(0.16, 0.0, abs(d - r));
        float fade = (1.0 - uProgress);
        gl_FragColor = vec4(uColor, band * fade * 0.5);
      }
    `,
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), ringMat);
  group.add(ring);

  // Central burst.
  const burstMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color("#fff6e6") },
    },
    vertexShader: `varying vec2 vUvC; void main(){ vUvC=(uv-0.5)*2.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform float uIntensity; uniform vec3 uColor;
      varying vec2 vUvC;
      void main() {
        float d = length(vUvC);
        float core = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(uColor, pow(core, 2.8) * uIntensity * 0.75);
      }
    `,
  });
  const burst = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), burstMat);
  group.add(burst);

  // Sparks drifting off the joined hands.
  const n = q.sparkCount;
  const pos = new Float32Array(n * 3);
  const seedArr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    seedArr[i] = Math.random();
    pos[i * 3] = (Math.random() - 0.5) * 0.16;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.16;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.16;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seedArr, 1));
  const sparkMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uColor: { value: new THREE.Color("#ffe6b8") },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uIntensity;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = fract(uTime * 0.28 + aSeed);
        p.y += t * 0.42;
        p.x += sin(aSeed * 40.0 + uTime) * 0.12 * t;
        vA = (1.0 - t) * uIntensity;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + aSeed * 3.0) * (40.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      uniform vec3 uColor; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * vA * 0.8);
      }
    `,
  });
  const sparks = new THREE.Points(geo, sparkMat);
  group.add(sparks);

  group.visible = false;
  return { group, ring, ringMat, burst, burstMat, sparks, sparkMat };
}

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

/** Matches the drawing buffer and camera to the canvas's CSS size. */
export function resizeHologram(h) {
  if (!h || !h.canvas) return;
  const rect = h.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const hgt = Math.max(1, Math.round(rect.height));
  h.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, h.quality.mobile ? 1.5 : 2));
  h.renderer.setSize(w, hgt, false);
  h.camera.aspect = w / hgt;
  // Widen the field of view on portrait phones so both figures still fit
  // without pushing the camera so far back that they become specks.
  h.camera.fov = h.camera.aspect < 0.8 ? 52 : h.camera.aspect < 1.2 ? 44 : 38;
  h.camera.updateProjectionMatrix();
}

/**
 * Releases every GPU resource this scene holds.
 *
 * Worth being thorough: a gift page can be left open for a long time, and a
 * leaked WebGL context on a phone is the difference between a smooth story
 * and a browser tab that gets killed halfway through.
 */
export function destroyHologram(h) {
  if (!h) return;
  const seen = new Set();
  h.scene.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) {
      seen.add(o.geometry);
      o.geometry.dispose();
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    mats.forEach((m) => {
      if (!seen.has(m)) {
        seen.add(m);
        m.dispose();
      }
    });
  });
  h.scene.clear();
  h.renderer.dispose();
  const ctx = h.renderer.getContext && h.renderer.getContext();
  const lose = ctx && ctx.getExtension && ctx.getExtension("WEBGL_lose_context");
  if (lose) lose.loseContext();
}
