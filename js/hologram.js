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
 */
function buildFigure(kind, q, material) {
  const seg = q.seg;
  const root = new THREE.Group();
  const meshes = [];

  const add = (geo, parent, y = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.y = y;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  const female = kind === "female";

  // Proportions. The male figure is a little taller and broader through the
  // shoulders; the female figure has a lathed dress. Between those two cues
  // the silhouettes stay readable even at low opacity, which matters because
  // that is all the viewer really sees of a hologram.
  const scale = female ? 0.94 : 1.0;
  const hipY = 0.92 * scale;
  const shoulderY = 1.42 * scale;
  const shoulderX = (female ? 0.15 : 0.19) * scale;
  const armLen = 0.34 * scale;
  const legLen = 0.44 * scale;

  // ---- torso ----
  const torso = new THREE.Group();
  torso.position.y = hipY;
  root.add(torso);

  const chest = add(
    new THREE.CapsuleGeometry(female ? 0.125 : 0.15, female ? 0.34 : 0.4, 4, seg),
    torso,
    0.28 * scale
  );
  chest.scale.set(1, 1, female ? 0.78 : 0.72);

  // Pelvis. Without it the torso capsule ends above the leg capsules and the
  // silhouette reads as a floating box over two sticks — the single change
  // that most made these look like a body rather than an assembly.
  const pelvis = add(
    new THREE.CapsuleGeometry(female ? 0.11 : 0.12, 0.1 * scale, 3, seg),
    torso,
    -0.02 * scale
  );
  pelvis.scale.set(1, 1, 0.74);

  // ---- head ----
  const neck = new THREE.Group();
  neck.position.y = shoulderY - hipY + 0.1 * scale;
  torso.add(neck);
  add(new THREE.SphereGeometry(0.105 * scale, seg, Math.max(8, seg * 0.7)), neck, 0.1 * scale);

  // Hair: a short lathed cap for him, a longer sweep for her. Cheap, but it
  // is what makes the two figures instantly distinguishable in silhouette.
  const hairPts = [];
  const hairLen = female ? 10 : 7;
  for (let i = 0; i <= hairLen; i++) {
    const t = i / hairLen;
    if (female) {
      // A long curtain falling past the shoulders.
      const r = 0.108 * Math.sin(t * Math.PI * 0.85 + 0.35) + 0.02;
      hairPts.push(new THREE.Vector2(Math.max(0.004, r) * scale, (0.2 - t * 0.42) * scale));
    } else {
      // A crown that hugs the skull. Tracing the sphere rather than an
      // arbitrary curve keeps the lower rim from cutting a visor across
      // the face.
      const a = t * 0.95;
      hairPts.push(new THREE.Vector2(
        Math.max(0.004, 0.112 * Math.sin(a)) * scale,
        (0.1 + 0.112 * Math.cos(a)) * scale
      ));
    }
  }
  const hair = add(new THREE.LatheGeometry(hairPts, seg), neck, 0);
  if (female) {
    // A lathe is radially symmetric, so her curtain would fall across her
    // face as well as her back. Nudging it behind the head and flattening it
    // slightly leaves the face clear while still framing it at the sides.
    hair.position.z = -0.045 * scale;
    hair.scale.set(0.94, 1, 1.12);
  }

  // ---- arms ----
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * shoulderX, shoulderY - hipY, 0);
    torso.add(shoulder);

    const upper = add(
      new THREE.CapsuleGeometry(0.042 * scale, armLen, 3, Math.max(6, seg * 0.6)),
      shoulder,
      -armLen / 2
    );
    upper.scale.setScalar(1);

    const elbow = new THREE.Group();
    elbow.position.y = -armLen;
    shoulder.add(elbow);

    add(
      new THREE.CapsuleGeometry(0.035 * scale, armLen * 0.9, 3, Math.max(6, seg * 0.6)),
      elbow,
      -armLen * 0.45
    );

    // An explicit hand node: the hand-holding effect needs a world position
    // to spawn light at, and reading it from a node is far more reliable than
    // recomputing the kinematics outside this module.
    const hand = new THREE.Group();
    hand.position.y = -armLen * 0.95;
    elbow.add(hand);
    add(new THREE.SphereGeometry(0.042 * scale, Math.max(6, seg * 0.5), Math.max(5, seg * 0.4)), hand, 0);

    return { shoulder, elbow, hand };
  };

  const armL = makeArm(-1);
  const armR = makeArm(1);

  // ---- lower body ----
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.075 * scale, 0, 0);
    torso.add(hip);
    add(new THREE.CapsuleGeometry(0.062 * scale, legLen, 3, Math.max(6, seg * 0.6)), hip, -legLen / 2);
    const knee = new THREE.Group();
    knee.position.y = -legLen;
    hip.add(knee);
    add(new THREE.CapsuleGeometry(0.052 * scale, legLen * 0.92, 3, Math.max(6, seg * 0.6)), knee, -legLen * 0.46);
    return { hip, knee };
  };

  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  // Her dress replaces the visible upper legs: a lathe flaring from waist to
  // hem. It also gives the dance something to move — see applyPose().
  let dress = null;
  if (female) {
    const pts = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Gentle flare, wider toward the hem.
      const r = 0.13 + Math.pow(t, 1.5) * 0.3;
      pts.push(new THREE.Vector2(r * scale, (0.08 - t * 0.72) * scale));
    }
    dress = add(new THREE.LatheGeometry(pts, Math.max(12, seg)), torso, 0);
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
