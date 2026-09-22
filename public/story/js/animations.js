/* ==========================================================================
   animations.js — all scroll-driven motion.
   Reads content from story.js (window.STORY). Owns:
     - the pinned, scrubbed main story timeline (character choreography +
       background crossfade + text + photos, all inside ONE GSAP timeline
       whose scrollTrigger has scrub + pin, per the implementation rule in
       the spec — scroll position literally IS the timeline position)
     - background parallax layers
     - the timeline (relationship-milestones) section
     - the final-scene reveal
   ========================================================================== */

(function () {
  const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initStoryAnimations() {
    gsap.registerPlugin(ScrollTrigger);

    const { storyScenes, memoryPhotos, timelineMilestones, backgroundScenes } = window.STORY;

    const section   = document.getElementById("scene-story");
    const stage     = section.querySelector(".stage");
    const bgLayer   = section.querySelector(".bg-layer");
    const cloudsEl  = section.querySelectorAll(".layer-clouds .cloud, .layer-clouds .twinkle");
    const decorEls  = section.querySelectorAll(".layer-decor .deco");
    const boyRoot   = document.getElementById("boy-root");
    const girlRoot  = document.getElementById("girl-root");
    const boyRArm   = document.getElementById("boy-right-arm");
    const girlLArm  = document.getElementById("girl-left-arm");
    const textEls   = {};

    // ---- build background scenes from config ----
    backgroundScenes.forEach((s, i) => {
      const el = document.createElement("div");
      el.className = "bg-scene";
      el.id = `bg-${s.id}`;
      el.style.background = `linear-gradient(160deg, ${s.from} 0%, ${s.to} 100%)`;
      el.setAttribute("aria-hidden", "true");
      bgLayer.appendChild(el);
      if (i === 0) gsap.set(el, { opacity: 1 });
    });

    // ---- build story text nodes from config ----
    const textWrap = section.querySelector(".story-text");
    storyScenes.forEach((t) => {
      const p = document.createElement("p");
      p.className = "line" + (t.small ? " small" : "");
      p.textContent = t.text;
      p.dataset.id = t.id;
      textWrap.appendChild(p);
      textEls[t.id] = p;
    });

    // ---- build memory photo nodes from config ----
    const photoWrap = section.querySelector(".memory-photos");
    const photoEls = {};
    memoryPhotos.forEach((m) => {
      const fig = document.createElement("figure");
      fig.className = "memory-photo" + (m.depth === "behind" ? " behind" : "");
      fig.style.left = `calc(50% + ${m.x})`;
      fig.style.top = `calc(38% + ${m.y})`;
      fig.innerHTML = `
        <img src="${m.src}" alt="${m.caption || 'memory'}" loading="lazy"
             onerror="this.closest('.memory-photo').classList.add('img-missing')">
        ${m.caption ? `<figcaption class="cap">${m.caption}</figcaption>` : ""}
      `;
      photoWrap.appendChild(fig);
      photoEls[m.id] = fig;
      gsap.set(fig, { xPercent: -50, rotate: m.rotate * 2, scale: 0.7, opacity: 0 });
    });

    if (REDUCE_MOTION) {
      // Simple, accessible fallback: fade everything in via normal scroll
      // reveal, skip the pinned scrub choreography entirely.
      Object.values(textEls).forEach((el) => gsap.set(el, { opacity: 1, y: 0 }));
      Object.values(photoEls).forEach((el) => gsap.set(el, { opacity: 1, scale: 1 }));
      gsap.set(`#bg-${backgroundScenes[backgroundScenes.length - 1].id}`, { opacity: 1 });
      gsap.set(boyRoot, { xPercent: 90 });
      gsap.set(girlRoot, { xPercent: -90 });
      initTimelineSection(timelineMilestones, true);
      initFinalScene(true);
      initParallax(true);
      return;
    }

    // ---- master pinned, scrubbed timeline ----
    // Total scrollable distance the story plays across. Longer = slower,
    // more deliberate pacing; tuned for a ~6s read-through at moderate
    // scroll speed on desktop, shorter feel on touch (inertia scroll).
    const STORY_DISTANCE = "+=420%";

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: STORY_DISTANCE,
        scrub: 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
      defaults: { ease: "none" },
    });

    // Helper: cross-fade background scene `id` in, and previous one out,
    // at position `pos` (0–100 scale matching timeline positions below).
    function crossfadeBg(id, pos) {
      tl.to(`#bg-${id}`, { opacity: 1, duration: 8 }, pos);
      backgroundScenes.forEach((s) => {
        if (s.id !== id) tl.to(`#bg-${s.id}`, { opacity: 0, duration: 8 }, pos);
      });
    }
    backgroundScenes.forEach((s) => crossfadeBg(s.id, s.at * 100));

    // Helper: reveal a story text line, then let it fade before the next.
    function showLine(id, pos, hold = 6) {
      const el = textEls[id];
      if (!el) return;
      tl.to(el, { opacity: 1, y: 0, filter: "blur(0px)", duration: 3 }, pos)
        .to(el, { opacity: 0, y: -10, duration: 3 }, pos + hold);
    }
    storyScenes.forEach((t) => showLine(t.id, t.at * 100));

    // Helper: fly a memory photo into place, hold, then drift out slightly.
    function flyPhoto(id, pos) {
      const el = photoEls[id];
      if (!el) return;
      tl.to(el, {
        opacity: 1, scale: 1, rotate: window.STORY.memoryPhotos.find(m => m.id === id).rotate,
        duration: 6, ease: "back.out(1.4)",
      }, pos)
      .to(el, { y: "-=14", duration: 10 }, pos + 1)
      .to(el, { opacity: 0.85, duration: 4 }, pos + 14);
    }
    memoryPhotos.forEach((m) => flyPhoto(m.id, m.at * 100));

    // ---- character choreography (percentages match the spec exactly) ----
    // Convergence amounts are tuned so the two figures end up standing
    // side by side with overlapping arms for the hold-hands/hug beats,
    // rather than fully overlapping into one silhouette.
    // 0%   boy left / girl right (initial CSS state, nothing to do)
    // 20%  boy starts walking toward girl
    tl.to(boyRoot,  { xPercent: 24, duration: 20 }, 20)
      .to(girlRoot, { xPercent: -24, duration: 20 }, 20)
      // 40% they meet
      .to(boyRoot,  { xPercent: 46, duration: 6 }, 40)
      .to(girlRoot, { xPercent: -46, duration: 6 }, 40)
      // 50% they look at each other — subtle head tilt + scale breath
      .to("#boy-head",  { rotate: -4, transformOrigin: "50% 100%", duration: 6 }, 50)
      .to("#girl-head", { rotate: 4,  transformOrigin: "50% 100%", duration: 6 }, 50)
      .to([boyRoot, girlRoot], { scale: 1.03, duration: 6 }, 50)
      // 60% they hold hands — inner arms rotate to meet
      .to(boyRArm,  { rotate: 42, transformOrigin: "50% 0%", duration: 8 }, 60)
      .to(girlLArm, { rotate: -42, transformOrigin: "50% 0%", duration: 8 }, 60)
      // 75% move closer
      .to(boyRoot,  { xPercent: 54, duration: 10 }, 75)
      .to(girlRoot, { xPercent: -54, duration: 10 }, 75)
      // 90% hug — both arms wrap around
      .to(boyRArm,  { rotate: 70, duration: 8 }, 90)
      .to(girlLArm, { rotate: -70, duration: 8 }, 90)
      .to("#boy-left-arm",  { rotate: -55, transformOrigin: "50% 0%", duration: 8 }, 90)
      .to("#girl-right-arm",{ rotate: 55,  transformOrigin: "50% 0%", duration: 8 }, 90)
      .to(boyRoot,  { xPercent: 58, scale: 1.06, duration: 8 }, 90)
      .to(girlRoot, { xPercent: -58, scale: 1.06, duration: 8 }, 90)
      // 100% transition — gentle glow flash into next chapter
      .to(".scene-transition-glow", { opacity: 0.5, duration: 4 }, 96)
      .to(".scene-transition-glow", { opacity: 0, duration: 4 }, 99);

    // ---- parallax layers (independent scrub tied to the SAME trigger) ----
    gsap.to(cloudsEl, {
      xPercent: (i) => (i % 2 === 0 ? -18 : 14),
      yPercent: -8,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top top", end: STORY_DISTANCE, scrub: 1.4 },
    });
    gsap.to(decorEls, {
      yPercent: -22,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top top", end: STORY_DISTANCE, scrub: 0.6 },
    });

    // idle breathing sway kept in CSS (animations.css) — independent of scroll

    initTimelineSection(timelineMilestones, false);
    initFinalScene(false);
  }

  // ---------------- Timeline (relationship milestones) section ----------------
  function initTimelineSection(milestones, reduced) {
    const track = document.getElementById("timeline-track");
    const fill = document.getElementById("timeline-fill");
    const items = track.querySelectorAll(".milestone");

    if (reduced) {
      items.forEach((el) => el.classList.add("active"));
      if (fill) fill.style.height = "100%";
      return;
    }

    gsap.to(fill, {
      height: "100%",
      ease: "none",
      scrollTrigger: {
        trigger: track,
        start: "top 70%",
        end: "bottom 60%",
        scrub: 0.6,
      },
    });

    items.forEach((el) => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 75%",
        end: "bottom 55%",
        onEnter: () => el.classList.add("active"),
        onLeaveBack: () => el.classList.remove("active"),
      });
    });
  }

  // ---------------- Final scene ----------------
  function initFinalScene(reduced) {
    const scene = document.getElementById("final-scene");
    const lines = scene.querySelectorAll(".final-line");
    const message = scene.querySelector(".final-message");
    const actions = scene.querySelector(".final-actions");
    const boy = document.getElementById("final-boy");
    const girl = document.getElementById("final-girl");

    if (reduced) {
      gsap.set([...lines, message, actions], { opacity: 1, y: 0 });
      return;
    }

    const tl = gsap.timeline({
      scrollTrigger: { trigger: scene, start: "top 65%", once: false, toggleActions: "play none none reverse" },
    });
    tl.to(boy,  { xPercent: 55, duration: 1.1, ease: "power2.out" }, 0)
      .to(girl, { xPercent: -55, duration: 1.1, ease: "power2.out" }, 0)
      .to(lines[0], { opacity: 1, y: 0, duration: 0.8 }, 0.4)
      .to(lines[0], { opacity: 0.55, duration: 0.6 }, 1.6)
      .to(lines[1], { opacity: 1, y: 0, duration: 0.8 }, 1.8)
      .to(message, { opacity: 1, y: 0, duration: 0.9 }, 2.6)
      .to(actions, { opacity: 1, y: 0, duration: 0.7 }, 3.3);
  }

  // ---------------- Standalone parallax fallback (used only for reduced motion) ----------------
  function initParallax() { /* no-op: handled inline above when motion is enabled */ }

  window.initStoryAnimations = initStoryAnimations;
})();
