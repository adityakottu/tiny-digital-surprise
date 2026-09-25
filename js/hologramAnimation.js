/**
 * hologramAnimation.js — the scroll-driven choreography.
 *
 * Two things drive the scene, and keeping them separate is what makes the
 * whole thing feel deliberate rather than busy:
 *
 *   1. `state.p` — a single 0..1 progress value owned by ScrollTrigger. It
 *      drives every *narrative* beat: where the figures stand, when they
 *      reach for each other, how close the camera is. Because it is a plain
 *      tweened number with `scrub`, scrolling back up reverses the entire
 *      story exactly, with no special-cased "reverse" code.
 *
 *   2. `clock` — wall time, independent of scroll. It drives only the micro
 *      life: breathing, flicker, drifting particles, the pulse travelling up
 *      each body. These keep running when the user stops scrolling, which is
 *      what stops a paused hologram from looking like a frozen screenshot.
 *
 * Poses are computed analytically from `p` in applyPose() rather than tweened
 * onto the objects. That means any progress value produces the correct pose
 * on its own — no accumulated drift, and a mid-scroll resize or tab-restore
 * simply renders the right frame.
 */

import { resizeHologram, destroyHologram } from "./hologram.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Maps `v` from [a,b] onto 0..1, clamped. The workhorse for staged beats. */
const seg = (v, a, b) => clamp01((v - a) / (b - a));

/** Smootherstep — gentler in and out than GSAP's power eases, which matters
 *  when the user controls the playhead and can stop anywhere. */
const ease = (t) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The beat map. Percentages come straight from the brief so the narrative and
 * the code can be compared line by line.
 */
export const BEATS = {
  // The approach is deliberately compressed and the dance given most of the
  // room. Meeting is the setup; dancing together is the part worth scrolling
  // through, and it now occupies roughly 40% of the timeline instead of 14%.
  appear: [0.0, 0.08],      // both figures form out of light, apart
  walkMale: [0.10, 0.26],   // he walks toward her
  walkFemale: [0.20, 0.31], // she walks toward him
  meet: [0.28, 0.35],       // they stop, a short distance apart
  look: [0.32, 0.39],       // they turn to face each other
  reach: [0.38, 0.45],      // hands extend
  hold: [0.45, 0.51],       // contact — the burst fires here
  frame: [0.50, 0.58],      // into a closed hold: his hand to her waist
  dance: [0.56, 0.95],      // the long slow dance
  rotate: [0.60, 0.93],     // they turn together, slowly, throughout
  twirl: [0.70, 0.80],      // she turns under their joined hands
  twirl2: [0.84, 0.93],     // and once more, closer to the end
  settle: [0.94, 1.0],      // final pose, still holding hands
};

/**
 * Poses the whole scene for a given progress value.
 * Pure function of (p, time) — call it with anything, get the right frame.
 */
export function applyPose(h, p, t) {
  const { male, female, camera, floor, materials } = h;

  const appear = ease(seg(p, ...BEATS.appear));
  const walkM = ease(seg(p, ...BEATS.walkMale));
  const walkF = ease(seg(p, ...BEATS.walkFemale));
  const look = ease(seg(p, ...BEATS.look));
  const reach = ease(seg(p, ...BEATS.reach));
  const hold = ease(seg(p, ...BEATS.hold));
  const framed = ease(seg(p, ...BEATS.frame));
  const dance = ease(seg(p, ...BEATS.dance));
  // Two turns rather than one, so the long dance has shape instead of a
  // single event followed by swaying. They never overlap, so taking the max
  // is enough to drive one twirl channel.
  const twirl = Math.max(
    Math.sin(clamp01(seg(p, ...BEATS.twirl)) * Math.PI),
    Math.sin(clamp01(seg(p, ...BEATS.twirl2)) * Math.PI)
  );
  const rotate = ease(seg(p, ...BEATS.rotate));
  const settle = ease(seg(p, ...BEATS.settle));

  // ---- master opacity ----
  // They resolve out of the dark rather than switching on.
  const bodyOpacity = appear * (0.72 + settle * 0.28);
  materials.male.uniforms.uOpacity.value = bodyOpacity;
  materials.female.uniforms.uOpacity.value = bodyOpacity;
  h.shells.forEach((s) => (s.uniforms.uOpacity.value = appear * (0.6 + settle * 0.4)));
  h.faceMats.forEach((m) => (m.uniforms.uOpacity.value = bodyOpacity));
  if (h.reflection) h.reflection.userData.mat.uniforms.uOpacity.value = bodyOpacity * 0.28;

  // ---- ground positions ----
  // Start wide, close to a hand's breadth apart. They never fully overlap:
  // two silhouettes that merge into one blob lose the whole point.
  const APART = 1.42;
  const NEAR = 0.63;
  // In a closed hold they stand far closer than arm's length apart.
  const CLOSE = 0.40;
  const framedNow = ease(seg(p, ...BEATS.frame));
  const mx = lerp(lerp(-APART, -NEAR, walkM), -CLOSE, framedNow);
  const fx = lerp(lerp(APART, NEAR, walkF), CLOSE, framedNow);
  male.root.position.x = mx;
  female.root.position.x = fx;

  // While dancing they orbit a shared centre.
  const centre = (mx + fx) / 2;
  // Draw them a little closer while they turn. The orbit separates them in
  // depth as well as across the screen, and at the standing distance that is
  // just far enough to pull their joined hands apart in the final frame.
  const radius = (Math.abs(fx - mx) / 2) * 0.88;
  // Keep the turn modest. A larger angle looks impressive mid-scroll but ends
  // with one figure eclipsing the other, and the last frame of this section is
  // the one that has to read as "the two of them, together".
  const spin = rotate * Math.PI * 0.22 + Math.sin(t * 0.55) * 0.05 * dance;
  if (dance > 0 || rotate > 0) {
    const blend = Math.max(dance, rotate);
    male.root.position.x = lerp(mx, centre - Math.cos(spin) * radius, blend);
    male.root.position.z = lerp(0, -Math.sin(spin) * radius, blend);
    female.root.position.x = lerp(fx, centre + Math.cos(spin) * radius, blend);
    female.root.position.z = lerp(0, Math.sin(spin) * radius, blend);
    const driftX = Math.sin(t * 0.17) * 0.16 * blend;
    const driftZ = Math.cos(t * 0.13) * 0.12 * blend;
    male.root.position.x += driftX;
    female.root.position.x += driftX;
    male.root.position.z += driftZ;
    female.root.position.z += driftZ;
  } else {
    male.root.position.z = 0;
    female.root.position.z = 0;
  }

  // ---- facing ----
  // Both start square to the viewer, then turn in toward each other, and turn
  // most of the way round once the hold forms.
  //
  // Sign matters and is easy to get backwards: Three's default forward is -z,
  // so a rotation.y of -PI/2 points a figure along +x. He stands at -x and
  // must face +x, so his angle is negative and hers positive. Turning them to
  // face each other is also what makes the hold possible at all — it brings
  // his left hand and her right hand onto the same side, where they can join.
  // Square to the camera they sit on opposite outer edges and never meet.
  const turn = lerp(0, 0.5, look) + lerp(0, 0.82, framed);

  // When the pair turns together, their facings must rotate the same way
  // their positions orbit. The orbit below places him at (-cos, -sin) * r,
  // which is a rotation of MINUS spin in Three's convention — so the facing
  // term is negative too. With a plus here the two disagree and the hold
  // tears itself apart: they orbit into a new arrangement while still facing
  // where they used to be.
  const pairTurn = spin * Math.max(dance, rotate);
  male.root.rotation.y = -turn - pairTurn;
  female.root.rotation.y = turn - pairTurn;

  // ---- walking gait ----
  // A simple pendulum on the hips, amplitude tied to how fast each figure is
  // actually covering ground, so the legs still when they arrive.
  const gaitM = Math.sin(t * 4.2) * 0.42 * (walkM > 0 && walkM < 1 ? 1 : 0);
  const gaitF = Math.sin(t * 4.2 + Math.PI) * 0.36 * (walkF > 0 && walkF < 1 ? 1 : 0);
  male.legL.hip.rotation.x = gaitM;
  male.legR.hip.rotation.x = -gaitM;
  male.legL.knee.rotation.x = Math.max(0, -gaitM) * 0.5;
  male.legR.knee.rotation.x = Math.max(0, gaitM) * 0.5;
  female.legL.hip.rotation.x = gaitF;
  female.legR.hip.rotation.x = -gaitF;

  // ---- slow dance sway ----
  // Weight shifting foot to foot, not a dance routine. Slow is the point.
  // Two slightly detuned frequencies, so the sway drifts in and out of
  // strength over the long dance instead of repeating on a fixed beat — the
  // difference between dancing and rocking.
  const swell = 0.68 + 0.32 * Math.sin(t * 0.21);
  const sway = Math.sin(t * 0.85) * dance * swell;
  const bob = Math.abs(Math.sin(t * 0.85)) * 0.035 * dance * swell;
  male.root.position.y = bob;
  female.root.position.y = bob * 0.9;
  male.torso.rotation.z = sway * 0.055;
  female.torso.rotation.z = sway * 0.07;
  male.root.rotation.z = sway * 0.02;
  female.root.rotation.z = -sway * 0.02;

  // ---- breathing (independent of scroll) ----
  const breath = Math.sin(t * 1.15) * 0.012 + 1;
  male.chest.scale.y = breath;
  female.chest.scale.y = breath * 1.005;

  // ---- arms ----
  // Sign convention, easy to get backwards: each arm mesh hangs BELOW its
  // shoulder pivot, so a positive rotation.z swings the hand toward +x and a
  // negative one toward -x. He stands at -x and she at +x, so his inner arm
  // reaches with a positive angle and hers with a negative one.
  const REST = 0.13;          // natural outward hang, away from the body
  const REACH = 0.94;
  const innerM = male.armR;   // his right arm, on the side facing her
  const innerF = female.armL; // her left arm, on the side facing him
  const outerM = male.armL;
  const outerF = female.armR;

  // Two poses, cross-faded by `frame`.
  //
  // First they simply reach across and take each other's hand. Then they move
  // into a proper closed hold — his hand travels round to her waist, hers
  // comes up to his shoulder, and their *other* pair of hands joins and lifts
  // to the side. That second shape is what makes a couple read as dancing
  // rather than as two people standing near each other holding hands, and it
  // is the pose every ballroom photograph is built on.
  const mix = (a, b) => lerp(a, b, framed);

  // His inner arm: from "reaching across" to "around her waist" — swung
  // further across and forward, elbow folded in behind her.
  // His hand travels to the small of her back, so the arm hangs and folds
  // forward rather than reaching out level with his chest.
  innerM.shoulder.rotation.z = mix(lerp(REST, REACH, reach), 0.20);
  innerM.shoulder.rotation.x = mix(lerp(0, -0.3, reach), 0.58);
  innerM.elbow.rotation.z = mix(lerp(0, -0.3, reach), -0.18);
  innerM.elbow.rotation.x = lerp(0, 0.70, framed);

  // Her inner arm: from reaching to resting on his shoulder — lifted higher,
  // elbow bent so the forearm runs up rather than across.
  // Her hand rests on his shoulder: lifted, with the elbow folded so the
  // forearm runs up his arm instead of jutting straight out.
  innerF.shoulder.rotation.z = mix(lerp(-REST, -REACH, reach), -0.24);
  innerF.shoulder.rotation.x = mix(lerp(0, -0.3, reach), 1.46);
  innerF.elbow.rotation.z = mix(lerp(0, 0.3, reach), 0.20);
  innerF.elbow.rotation.x = lerp(0, -0.26, framed);

  // The outer pair become the joined hands once the hold is framed, lifting
  // out to the side and higher still through the twirl.
  // The joined pair: lifted to about shoulder height and held out to the
  // side, elbows softly bent — the frame every ballroom photograph shows.
  const lift = Math.max(framed, twirl);
  outerM.shoulder.rotation.z = lerp(-REST, -0.46, lift) + sway * 0.05;
  outerM.shoulder.rotation.x = lerp(0, 1.44 + twirl * 0.20, lift);
  outerM.elbow.rotation.x = lerp(0, -0.30 - twirl * 0.14, lift);

  outerF.shoulder.rotation.z = lerp(REST, 0.46, lift) - sway * 0.05;
  outerF.shoulder.rotation.x = lerp(0, 1.44 + twirl * 0.20, lift);
  outerF.elbow.rotation.x = lerp(0, -0.30 - twirl * 0.14, lift);

  // She turns under their raised hands, then comes back to face him.
  female.root.rotation.y += twirl * 0.52;

  // A small release mid-dance so it breathes — never enough to read as
  // letting go.
  const release = Math.sin(clamp01(seg(p, 0.88, 0.96)) * Math.PI) * 0.10;
  outerM.shoulder.rotation.z -= release * 0.5;
  outerF.shoulder.rotation.z += release * 0.5;

  // ---- head / gaze ----
  // Heads turn toward each other as they look — but once they are dancing in
  // profile, counter-rotate part of the body's turn so their faces stay at
  // least three-quarters on to the viewer. Without this the photo faces are
  // edge-on for most of the dance, which is exactly when people are looking
  // at them. Dancers do glance out of the frame, so it reads naturally.
  const faceOut = Math.max(framed, dance) * 0.62;
  male.neck.rotation.y = lerp(0, 0.34, look) + turn * faceOut;
  female.neck.rotation.y = lerp(0, -0.34, look) - turn * faceOut;
  male.neck.rotation.z = lerp(0, -0.08, look) + sway * 0.03;
  female.neck.rotation.z = lerp(0, 0.08, look) - sway * 0.03;

  // ---- dress motion ----
  if (female.dress) {
    female.dress.rotation.y = sway * 0.16 + spin * 0.2 * Math.max(dance, rotate);
    female.dress.scale.x = 1 + Math.abs(sway) * 0.035;
    female.dress.scale.z = 1 + Math.abs(sway) * 0.035;
  }

  // ---- floor ----
  floor.mat.uniforms.uOpacity.value = appear;
  floor.mat.uniforms.uEnergy.value = Math.max(dance, rotate) * 0.85 + hold * 0.3;
  floor.mat.uniforms.uStep.value = t * 0.5;
  floor.mat.uniforms.uFootL.value.set(male.root.position.x / 2.6, male.root.position.z / 2.6);
  floor.mat.uniforms.uFootR.value.set(female.root.position.x / 2.6, female.root.position.z / 2.6);

  // ---- hand-holding effect ----
  createHandHoldingEffect(h, p, t);

  // ---- camera ----
  // Medium-wide, then a slow push in, a small lift for the hand-hold, and a
  // gentle orbit during the dance. Everything here is deliberately small:
  // the user is already moving the world with their scroll, and a camera that
  // also swings makes people queasy.
  const push = ease(seg(p, 0.1, 0.72));
  const orbit = Math.sin(t * 0.16) * 0.5 * Math.max(dance, rotate);
  let dist = lerp(6.4, 4.5, push) - hold * 0.25 - settle * 0.15;

  // Never let the framing crop them. On a portrait phone the horizontal field
  // of view is a fraction of the vertical one, so a distance that frames the
  // couple nicely on a laptop cuts both of them in half. Derive the minimum
  // distance that keeps the full span in frame and back off to at least that.
  // Measure the span actually occupied rather than assuming a fixed one: they
  // are widest apart at the start and closest at the end, so a constant would
  // either crop the opening or leave the finish sitting too far away.
  const halfSpan =
    Math.max(Math.abs(male.root.position.x), Math.abs(female.root.position.x)) +
    (female.dress ? 0.52 : 0.42);
  const vHalf = Math.tan((camera.fov * Math.PI) / 360);
  const minDist = halfSpan / (vHalf * camera.aspect);
  if (minDist > dist) dist = minDist;
  const ang = orbit * 0.22;
  camera.position.x = Math.sin(ang) * dist + h.parallax.x;
  camera.position.z = Math.cos(ang) * dist;
  camera.position.y = lerp(1.65, 1.25, push) + h.parallax.y + Math.sin(t * 0.3) * 0.02;
  camera.lookAt(0, lerp(0.95, 1.12, push), 0);
}

/**
 * The moment their hands meet.
 *
 * Positioned from the actual hand nodes rather than a guessed coordinate, so
 * it stays correct if the proportions or the reach pose are ever retuned.
 * Romantic rather than sci-fi: a warm burst that blooms and then mostly
 * fades, leaving a soft link between the hands.
 */
export function createHandHoldingEffect(h, p, t) {
  const { handFx, male, female } = h;

  // Contact ramps in over the hold beat and lingers, dimmed, for the rest.
  const contact = clamp01(seg(p, BEATS.hold[0], BEATS.hold[1]));
  if (contact <= 0) {
    handFx.group.visible = false;
    return;
  }
  handFx.group.visible = true;

  // Midpoint between the joined hands, in world space.
  //
  // Which pair is joined changes partway through: they first take each
  // other's inner hand, then move into a closed hold where the OUTER pair is
  // the one clasped. Blend between the two midpoints by the same factor that
  // drives the pose, so the light travels with them instead of jumping.
  const framed = ease(seg(p, ...BEATS.frame));
  const a = male.armR.hand.getWorldPosition(h._v1);
  const b = female.armL.hand.getWorldPosition(h._v2);
  const inner = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };

  const c = male.armL.hand.getWorldPosition(h._v3);
  const d = female.armR.hand.getWorldPosition(h._v4);
  const outer = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2, z: (c.z + d.z) / 2 };

  handFx.group.position.set(
    lerp(inner.x, outer.x, framed),
    lerp(inner.y, outer.y, framed),
    lerp(inner.z, outer.z, framed)
  );

  // Billboard the flat effects toward the camera.
  handFx.group.quaternion.copy(h.camera.quaternion);

  // The burst peaks at first contact then decays to a soft residual glow, so
  // the link stays visible through the dance without dominating it.
  const burst = Math.sin(contact * Math.PI);
  const residual = contact * 0.22;
  handFx.burstMat.uniforms.uIntensity.value = burst * 0.85 + residual;
  handFx.ringMat.uniforms.uProgress.value = contact;
  handFx.sparkMat.uniforms.uIntensity.value = burst * 0.7 + residual * 0.8;
  handFx.sparkMat.uniforms.uTime.value = t;
  handFx.ring.scale.setScalar(lerp(0.6, 1.9, contact));
}

/**
 * Wires the scene to the page: pinned section, scrubbed progress, synced text.
 * Returns a controller with destroy().
 */
export function createDanceTimeline(h, section, opts = {}) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) {
    console.warn("[hologram] GSAP/ScrollTrigger missing — showing the final pose statically.");
    applyPose(h, 1, 0);
    h.renderer.render(h.scene, h.camera);
    return { destroy() {} };
  }
  gsap.registerPlugin(ScrollTrigger);

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const state = { p: 0 };
  const clock = new h.THREE.Clock();

  // Scratch vectors — allocated once, reused every frame. Allocating inside
  // the render loop is the classic way to make a phone stutter every few
  // seconds when the GC runs.
  h._v1 = new h.THREE.Vector3();
  h._v2 = new h.THREE.Vector3();
  h._v3 = new h.THREE.Vector3();
  h._v4 = new h.THREE.Vector3();
  h.parallax = { x: 0, y: 0 };

  const lines = Array.from(section.querySelectorAll("[data-holo-line]"));
  const showLine = (el, at, until) => {
    tl.to(el, { opacity: 1, y: 0, filter: "blur(0px)", duration: 4 }, at * 100)
      .to(el, { opacity: 0, y: -12, filter: "blur(6px)", duration: 4 }, until * 100);
  };

  let tl;

  if (reduced) {
    // Reduced motion: no pin, no scrub. Show a composed final pose and let the
    // text appear normally. The section still tells the story, it just does
    // not move under the reader.
    //
    // state.p must be moved too, not just posed once: the render loop re-poses
    // from state.p every frame, so leaving it at 0 would fade the couple back
    // out to nothing immediately after this call.
    state.p = 1;
    applyPose(h, 1, 0);
    lines.forEach((el) => gsap.set(el, { opacity: 1, y: 0, filter: "blur(0px)" }));
    tl = gsap.timeline();
  } else {
    tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: opts.distance || "+=640%",
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
      defaults: { ease: "none" },
    });

    // The one tween that matters: scroll position -> progress.
    tl.to(state, { p: 1, duration: 100 }, 0);

    // Text beats, synced to the choreography. Each line is tied to the beat it
    // belongs to rather than spread evenly, so the words land with the action.
    // Six beats across the longer timeline, each tied to what is happening
    // rather than spaced evenly. Wording is the story's own where it already
    // had a line for that moment.
    if (lines[0]) showLine(lines[0], 0.02, 0.14);  // figures forming
    if (lines[1]) showLine(lines[1], 0.20, 0.30);  // walking toward each other
    if (lines[2]) showLine(lines[2], 0.45, 0.55);  // their hands meet
    if (lines[3]) showLine(lines[3], 0.60, 0.72);  // the dance begins
    if (lines[4]) showLine(lines[4], 0.78, 0.90);  // deep in the dance
    if (lines[5]) {
      // Closing line stays up through the end of the section.
      tl.to(lines[5], { opacity: 1, y: 0, filter: "blur(0px)", duration: 5 }, 94);
    }
  }

  // This trigger is created lazily, long after the story's own pinned
  // triggers measured the page. Pinning inserts a spacer, which shifts
  // everything below it, so every trigger has to re-measure now — without
  // this the story and hologram pins overlap and fight for the viewport.
  ScrollTrigger.refresh();

  // ---- render loop ----
  let raf = 0;
  let running = false;
  let visible = true;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();

    // Micro-animation, always live regardless of scroll.
    const flickerM = 1 - Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 2.1)) * 0.055;
    const flickerF = 1 - Math.max(0, Math.sin(t * 6.1 + 1.7) * Math.sin(t * 2.6)) * 0.05;
    h.materials.male.uniforms.uTime.value = t;
    h.materials.female.uniforms.uTime.value = t;
    h.materials.male.uniforms.uFlicker.value = flickerM;
    h.materials.female.uniforms.uFlicker.value = flickerF;
    // Light pulse travelling up each body, offset so they are never in sync.
    h.materials.male.uniforms.uPulse.value = (t * 0.22) % 1;
    h.materials.female.uniforms.uPulse.value = (t * 0.22 + 0.5) % 1;
    h.faceMats.forEach((m) => (m.uniforms.uTime.value = t));
    h.floor.mat.uniforms.uTime.value = t;
    h.dust.mat.uniforms.uTime.value = t;
    h.dust.mat.uniforms.uOpacity.value = 1;
    h.stars.mat.uniforms.uTime.value = t;
    h.stars.mat.uniforms.uOpacity.value = 1;
    h.romance.mat.uniforms.uTime.value = t;
    // Hearts and petals build with the scene rather than being there from the
    // first frame, so the reveal still belongs to the couple.
    h.romance.mat.uniforms.uOpacity.value = Math.min(1, state.p * 2.4);
    if (h.reflection) h.reflection.userData.mat.uniforms.uTime.value = t;

    // If the optional GLB shipped animation clips, advance them too. The
    // procedural pose still drives position and facing, so the two compose
    // rather than fight.
    if (h.mixer) h.mixer.update(Math.min(0.05, clock.getDelta ? 0 : 0) || 1 / 60);

    applyPose(h, state.p, t);
    syncReflection(h);

    h.renderer.render(h.scene, h.camera);
  };

  const start = () => {
    if (running) return;
    running = true;
    clock.start();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  };

  // Only render while the section is actually on screen. A WebGL loop running
  // behind three screens of scrolled-past content is pure battery burn.
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    },
    { rootMargin: "120px" }
  );
  io.observe(section);

  const onVisibility = () => {
    if (document.hidden) stop();
    else if (visible) start();
  };
  document.addEventListener("visibilitychange", onVisibility);

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeHologram(h);
      ScrollTrigger.refresh();
    });
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  // Guard against a lost context (phones drop them under memory pressure).
  const onLost = (e) => {
    e.preventDefault();
    stop();
    section.classList.add("holo-failed");
  };
  h.canvas.addEventListener("webglcontextlost", onLost);

  return {
    state,
    timeline: tl,
    destroy() {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      h.canvas.removeEventListener("webglcontextlost", onLost);
      if (tl.scrollTrigger) tl.scrollTrigger.kill();
      tl.kill();
      destroyHologram(h);
    },
  };
}

/** Keeps the mirrored meshes glued to the joints they reflect. */
function syncReflection(h) {
  if (!h.reflection) return;
  const pairs = h.reflection.userData.pairs;
  for (let i = 0; i < pairs.length; i++) {
    const [src, dst] = pairs[i];
    src.getWorldPosition(dst.position);
    src.getWorldQuaternion(dst.quaternion);
    dst.scale.copy(src.scale);
  }
}
