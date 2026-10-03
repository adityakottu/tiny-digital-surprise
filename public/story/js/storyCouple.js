/**
 * storyCouple.js — the 3D couple in chapter one.
 *
 * The opening chapter had a pair of flat SVG figures. This replaces them
 * with the same 3D bodies the hologram chapter builds, lit warmly instead of
 * projected — so they read as a man and a woman standing in the scene while
 * the memories arrive around them, rather than as a diagram.
 *
 * It deliberately reuses buildFigure() from hologram.js. One rig, one set of
 * proportions, one place to fix them; the only difference between the two
 * chapters is what the surfaces are made of.
 *
 * On the shading: the vendored Three build is tree-shaken down to what this
 * site imports, and it contains no lights and no standard materials — only
 * ShaderMaterial. That is not a limitation worth fighting. A hand-written
 * three-tone ramp with a rim light costs one small shader, needs no light
 * objects, and gives a cleaner illustrated look than a physically-based
 * material would at this size.
 */

import * as THREE from "./vendor/three.module.min.js";
import { buildFigure, detectQuality } from "./hologram.js";

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

const SKIN_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKIN_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;     // the surface
  uniform vec3 uShade;     // where the key light does not reach
  uniform vec3 uRim;       // the edge light that lifts them off the backdrop
  uniform float uOpacity;
  uniform float uGloss;    // 0 cloth, 1 skin — how tight the highlight is
  varying vec3 vN;
  varying vec3 vV;

  void main() {
    vec3 N = normalize(vN);
    vec3 L = normalize(vec3(-0.45, 0.78, 0.62));   // key, up and to the left

    // A soft three-tone ramp rather than a linear falloff: banding the light
    // a little is what makes a surface read as illustrated instead of
    // plastic, and it survives being shrunk to phone size.
    float d = dot(N, L) * 0.5 + 0.5;
    float ramp = smoothstep(0.34, 0.52, d) * 0.55 + smoothstep(0.52, 0.86, d) * 0.45;

    vec3 col = mix(uShade, uColor, ramp);

    // A dim bounce from below, so the undersides are not dead.
    float bounce = clamp(dot(N, vec3(0.2, -1.0, 0.25)), 0.0, 1.0);
    col += uShade * bounce * 0.22;

    // Rim: strongest where the surface turns away from the viewer.
    float fres = pow(1.0 - clamp(dot(N, normalize(vV)), 0.0, 1.0), 3.0);
    col += uRim * fres * 0.85;

    // A single specular lobe, tight on skin and broad on cloth.
    vec3 H = normalize(L + normalize(vV));
    float spec = pow(clamp(dot(N, H), 0.0, 1.0), mix(12.0, 48.0, uGloss));
    col += vec3(1.0) * spec * mix(0.05, 0.22, uGloss);

    gl_FragColor = vec4(col, uOpacity);
  }
`;

function surface(color, opts = {}) {
  const base = new THREE.Color(color);
  const shade = base.clone().multiplyScalar(opts.shade == null ? 0.42 : opts.shade);
  return new THREE.ShaderMaterial({
    vertexShader: SKIN_VERT,
    fragmentShader: SKIN_FRAG,
    transparent: true,
    uniforms: {
      uColor: { value: base },
      uShade: { value: shade },
      uRim: { value: new THREE.Color(opts.rim || "#ffd9b8") },
      uOpacity: { value: 0 },
      uGloss: { value: opts.gloss == null ? 0.6 : opts.gloss },
    },
  });
}

/**
 * Repaints a figure part by part.
 *
 * buildFigure() paints every mesh with one material, which is all the
 * hologram needs. Rather than change its signature — and risk the chapter
 * that already works — the rig it returns is walked here and each mesh
 * classified from what it is attached to and what shape it is. The figure
 * already hands back the head, the chest, the dress and every limb joint, so
 * the only guesswork is inside the neck, where geometry type separates the
 * throat from the skull from the hair.
 */
function paint(fig, kit) {
  const set = (mesh, mat) => { if (mesh && mesh.isMesh) mesh.material = mat; };

  // Limbs: every mesh hanging off a joint.
  [fig.armL, fig.armR].forEach((arm) => {
    if (!arm) return;
    [arm.shoulder, arm.elbow, arm.hand].forEach((j, i) => {
      if (!j) return;
      j.children.forEach((c) => set(c, i === 2 ? kit.skin : kit.sleeve));
    });
  });
  [fig.legL, fig.legR].forEach((leg) => {
    if (!leg) return;
    [leg.hip, leg.knee, leg.foot].forEach((j) => {
      if (!j) return;
      j.children.forEach((c) => set(c, kit.trouser));
    });
  });

  // Head, throat, hair — told apart by geometry, since they share a parent.
  if (fig.neck) {
    fig.neck.children.forEach((c) => {
      if (!c.isMesh) return;
      if (c === fig.headMesh) return set(c, kit.skin);
      const type = c.geometry && c.geometry.type;
      if (type === "CylinderGeometry") return set(c, kit.skin);   // throat
      if (type === "LatheGeometry") {
        set(c, kit.hair);
        if (kit.thickenHair) {
          // His hair is a crown that sits 6mm proud of the skull. Against a
          // translucent hologram that is enough to shape the silhouette;
          // lit and opaque it reads as a bald head with a dark line on top.
          // Scaled here rather than in buildFigure, which the hologram
          // chapter shares and which looks right as it is.
          c.scale.set(1.12, 1.1, 1.12);
          c.position.y -= 0.012 * fig.scale;
        }
        return;
      }
      return set(c, kit.hair);                                    // bun
    });
  }
  set(fig.headMesh, kit.skin);

  // Whatever is left on the torso is what they are wearing.
  if (fig.torso) {
    fig.torso.children.forEach((c) => { if (c.isMesh) set(c, kit.garment); });
  }
  set(fig.chest, kit.garment);
  set(fig.dress, kit.garment);
}


/* ------------------------------------------------------------------ *
 * Faces
 * ------------------------------------------------------------------ */

/**
 * A cartoon face drawn on a transparent canvas, to sit on the head as a decal.
 *
 * Separate from the hologram's version on purpose. That one is drawn for an
 * additive, re-tinted surface: a dim plate with bright features, which is
 * exactly wrong on a lit face. Here the background is transparent and the
 * marks are dark, so they read as features ON skin rather than as light.
 */
function faceTexture(female) {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d");
  if (!g) return null;
  const px = (f) => f * S;
  const INK = "#3a2219";

  const eyeY = px(0.45);
  const eyeDX = px(female ? 0.125 : 0.132);
  const eyeRX = px(female ? 0.085 : 0.08);
  const eyeRY = px(female ? 0.1 : 0.088);

  [-1, 1].forEach((side) => {
    const ex = px(0.5) + side * eyeDX;

    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(ex, eyeY, eyeRX, eyeRY, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(ex - side * eyeRX * 0.1, eyeY + eyeRY * 0.05, eyeRX * 0.56, eyeRY * 0.6, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(ex - eyeRX * 0.22, eyeY - eyeRY * 0.3, eyeRX * 0.2, eyeRY * 0.2, 0, 0, Math.PI * 2);
    g.fill();

    // Upper lid, heavier on her — with the brows, the clearest thing telling
    // the two characters apart at this size.
    g.strokeStyle = INK;
    g.lineCap = "round";
    g.lineWidth = S * (female ? 0.019 : 0.013);
    g.beginPath();
    g.ellipse(ex, eyeY, eyeRX * 1.02, eyeRY * 1.02, 0, Math.PI * 1.1, Math.PI * 1.9);
    g.stroke();
  });

  g.strokeStyle = INK;
  g.lineCap = "round";
  g.lineWidth = S * (female ? 0.02 : 0.03);
  [-1, 1].forEach((side) => {
    const bx = px(0.5) + side * eyeDX;
    const by = eyeY - px(female ? 0.145 : 0.133);
    g.beginPath();
    if (female) {
      g.moveTo(bx - side * px(0.074), by + px(0.02));
      g.quadraticCurveTo(bx, by - px(0.032), bx + side * px(0.076), by + px(0.008));
    } else {
      g.moveTo(bx - side * px(0.084), by + px(0.015));
      g.quadraticCurveTo(bx, by - px(0.015), bx + side * px(0.08), by + px(0.005));
    }
    g.stroke();
  });

  // The smile sits at 0.60, not where it looks right on a flat canvas:
  // projecting onto a sphere squeezes the last stretch toward the jaw to
  // nothing, so anything lower lands on the chin and is never seen.
  const my = px(0.6);
  const mw = px(female ? 0.095 : 0.105);
  g.strokeStyle = INK;
  g.lineWidth = S * 0.026;
  g.beginPath();
  g.moveTo(px(0.5) - mw, my);
  g.quadraticCurveTo(px(0.5), my + px(0.085), px(0.5) + mw, my);
  g.stroke();

  if (female) {
    g.fillStyle = "rgba(214,98,124,0.33)";
    [-1, 1].forEach((side) => {
      g.beginPath();
      g.ellipse(px(0.5) + side * px(0.2), px(0.56), px(0.062), px(0.044), 0, 0, Math.PI * 2);
      g.fill();
    });
  }

  return c.toDataURL("image/png");
}

const FACE_FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform vec3 uShade;
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec3 vN;

  void main() {
    if (vNormalL.z < -0.05) discard;

    vec2 uv = vec2(
      vLocal.x / 0.092 * 0.5 + 0.5,
      vLocal.y / 0.12 * 0.5 + 0.48
    );
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

    vec4 tex = texture2D(uMap, vec2(uv.x, 1.0 - uv.y));
    if (tex.a < 0.01) discard;

    // Lit by the same key as the skin underneath, so the features sit in the
    // face rather than glowing on top of it.
    vec3 L = normalize(vec3(-0.45, 0.78, 0.62));
    float d = dot(normalize(vN), L) * 0.5 + 0.5;
    float ramp = smoothstep(0.34, 0.52, d) * 0.55 + smoothstep(0.52, 0.86, d) * 0.45;

    gl_FragColor = vec4(mix(uShade, tex.rgb, 0.35 + ramp * 0.65), tex.a * uOpacity);
  }
`;

const FACE_VERT = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalL;
  varying vec3 vN;
  void main() {
    vLocal = position;
    vNormalL = normalize(normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

function attachLitFace(fig, female, q) {
  return new Promise((resolve) => {
    const url = faceTexture(female);
    if (!url) return resolve(null);
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        const mat = new THREE.ShaderMaterial({
          vertexShader: FACE_VERT,
          fragmentShader: FACE_FRAG,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uMap: { value: tex },
            uOpacity: { value: 0 },
            uShade: { value: new THREE.Color("#6d4430") },
          },
        });
        const seg = Math.max(16, q.seg || 20);
        const mesh = new THREE.Mesh(
          // Only just proud of the skull: any more and the shell's crown
          // rises above the hairline and clips the hair from the front.
          new THREE.SphereGeometry(0.099 * fig.scale * 1.008, seg, Math.max(12, seg * 0.7)),
          mat
        );
        mesh.scale.set(0.92, 1.12, 0.94);
        mesh.position.y = 0.125 * fig.scale;
        fig.neck.add(mesh);
        resolve(mat);
      },
      undefined,
      () => resolve(null)
    );
  });
}

/* ------------------------------------------------------------------ *
 * The scene
 * ------------------------------------------------------------------ */

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export async function initStoryCouple(canvas) {
  const q = detectQuality();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !q.mobile, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.mobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  const kits = {
    male: {
      skin: surface("#f0c49a", { gloss: 0.8, rim: "#ffd9b8" }),
      hair: surface("#3a2a22", { gloss: 0.75, shade: 0.5, rim: "#c9a07a" }),
      garment: surface("#4a5a8f", { gloss: 0.25, rim: "#9fb6e8" }),
      sleeve: surface("#44538a", { gloss: 0.25, rim: "#9fb6e8" }),
      trouser: surface("#2e3658", { gloss: 0.2, rim: "#8fa2d8" }),
      thickenHair: true,
    },
    female: {
      skin: surface("#f6cfa8", { gloss: 0.8, rim: "#ffdcc4" }),
      hair: surface("#4a2f24", { gloss: 0.75, shade: 0.5, rim: "#d6a884" }),
      garment: surface("#c8537c", { gloss: 0.3, rim: "#ffb3cd" }),
      sleeve: surface("#f6cfa8", { gloss: 0.8, rim: "#ffdcc4" }),
      trouser: surface("#f6cfa8", { gloss: 0.8, rim: "#ffdcc4" }),
    },
  };

  const male = buildFigure("male", q, kits.male.garment);
  const female = buildFigure("female", q, kits.female.garment);
  paint(male, kits.male);
  paint(female, kits.female);

  const faceMats = (
    await Promise.all([attachLitFace(male, false, q), attachLitFace(female, true, q)])
  ).filter(Boolean);

  const stage = new THREE.Group();
  stage.add(male.root, female.root);
  scene.add(stage);

  // A soft contact shadow each. Without something under them they read as
  // cut out and pasted on rather than standing in the scene.
  const shadowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `precision mediump float; uniform float uOpacity; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0;
        gl_FragColor = vec4(0.07, 0.03, 0.06, smoothstep(1.0, 0.0, d) * 0.42 * uOpacity); }`,
  });
  const shadows = [male, female].map((fig) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.42), shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    fig.root.add(m);
    return m;
  });

  const allMats = [];
  Object.keys(kits).forEach((k) => {
    Object.keys(kits[k]).forEach((part) => {
      const m = kits[k][part];
      if (m && m.uniforms) allMats.push(m);   // skips flags like thickenHair
    });
  });
  faceMats.forEach((m) => allMats.push(m));

  const handle = {
    THREE, renderer, scene, camera, stage, male, female,
    materials: allMats, shadowMat, shadows, quality: q,
    _v: new THREE.Vector3(),
  };

  resizeStoryCouple(handle);
  return handle;
}

export function resizeStoryCouple(h) {
  const canvas = h.renderer.domElement;
  const w = canvas.clientWidth || 1;
  const ht = canvas.clientHeight || 1;
  h.renderer.setSize(w, ht, false);
  h.camera.aspect = w / ht;
  // A tall, narrow frame needs a wider lens or the pair will not fit side by
  // side; the same lesson the hologram chapter learned.
  h.camera.fov = h.camera.aspect < 0.85 ? 48 : 34;
  h.camera.updateProjectionMatrix();
}

/**
 * Poses the couple for a chapter progress of 0..1 and a wall clock.
 *
 * Pure function of (p, t) like the hologram's: any scroll position renders
 * the right frame, and scrolling back needs no special case.
 */
export function poseStoryCouple(h, p, t) {
  const { male, female, camera } = h;
  const fade = clamp01(p / 0.06);

  h.materials.forEach((m) => (m.uniforms.uOpacity.value = fade));
  h.shadowMat.uniforms.uOpacity.value = fade;

  // They start a little apart and close the gap across the chapter — the
  // memories arriving between them are what brings them together.
  const apart = lerp(0.92, 0.52, clamp01(p * 1.15));
  male.root.position.x = -apart;
  female.root.position.x = apart;

  // And turn to face each other as they close.
  const turn = lerp(0.1, 0.62, clamp01(p * 1.15));
  male.root.rotation.y = -turn;
  female.root.rotation.y = turn;

  // Breathing and a slow weight shift, on the clock rather than the scroll,
  // so they stay alive when the reader stops moving.
  const sway = Math.sin(t * 0.7) * 0.02;
  male.torso.rotation.z = sway;
  female.torso.rotation.z = -sway * 1.1;
  male.root.position.y = Math.abs(Math.sin(t * 0.7)) * 0.012;
  female.root.position.y = Math.abs(Math.sin(t * 0.7 + 0.6)) * 0.011;
  const breath = 1 + Math.sin(t * 1.1) * 0.012;
  if (male.chest) male.chest.scale.y = breath;
  if (female.chest) female.chest.scale.y = breath * 1.004;

  // Arms rest, with a small life of their own. The rig hangs each arm below
  // its shoulder, so a positive z swings the hand outward.
  const swing = Math.sin(t * 0.55) * 0.05;
  if (male.armL) male.armL.shoulder.rotation.z = -0.17 - swing;
  if (male.armR) male.armR.shoulder.rotation.z = 0.17 + swing;
  if (female.armL) female.armL.shoulder.rotation.z = -0.15 + swing;
  if (female.armR) female.armR.shoulder.rotation.z = 0.15 - swing;

  // The camera eases in a touch over the chapter and floats very slightly.
  // Aimed at chest height and pulled back enough to keep their feet in
  // frame: looking at y=1.0 from 4.9 left them hanging in the top half of a
  // tall phone screen with an empty lower half.
  const dist = lerp(4.3, 3.7, clamp01(p)) * (camera.aspect < 0.85 ? 1.12 : 1);
  camera.position.set(Math.sin(t * 0.11) * 0.09, 1.05, dist);
  camera.lookAt(0, 0.92, 0);
}

export function destroyStoryCouple(h) {
  if (!h) return;
  h.scene.traverse((o) => {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    }
  });
  h.renderer.dispose();
}
