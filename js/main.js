/* ==========================================================================
   main.js — boot sequence. Loads last (after story.js, animations.js,
   audio.js, interactions.js are all defined), wires the loading screen,
   the opening screen, and hands off to the other modules once the user
   taps "Start Our Story".
   ========================================================================== */

(function () {
  document.addEventListener("DOMContentLoaded", () => {
    populateFinalMessage();
    populateTimelineMilestones();
    lockScroll();
    runLoadingScreen();
  });

  function lockScroll() {
    document.body.classList.add("no-scroll");
  }
  function unlockScroll() {
    document.body.classList.remove("no-scroll");
  }

  function runLoadingScreen() {
    const loader = document.getElementById("loading-screen");
    // Preload only what's critical: nothing heavy is required for the
    // opening screen itself, so keep this short — spec §15.
    const MIN_SHOW_MS = 900;
    const start = Date.now();
    const finish = () => {
      const elapsed = Date.now() - start;
      const wait = Math.max(0, MIN_SHOW_MS - elapsed);
      setTimeout(() => {
        loader.classList.add("hidden");
        revealOpeningScreen();
      }, wait);
    };
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    // Safety net so a slow/blocked asset never traps the user on the loader.
    setTimeout(finish, 3000);
  }

  function revealOpeningScreen() {
    const eyebrow = document.querySelector(".opening-eyebrow");
    const sub = document.querySelector(".opening-sub");
    const btn = document.querySelector(".start-btn");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || typeof gsap === "undefined") {
      [eyebrow, sub, btn].forEach((el) => el && (el.style.opacity = 1));
    } else {
      gsap.timeline()
        .to(eyebrow, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" })
        .fromTo(eyebrow, { y: 14 }, { y: 0, duration: 0.8, ease: "power2.out" }, "<")
        .to(sub, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, "-=0.35")
        .fromTo(sub, { y: 12 }, { y: 0, duration: 0.7, ease: "power2.out" }, "<")
        .to(btn, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, "-=0.3")
        .fromTo(btn, { y: 10 }, { y: 0, duration: 0.6, ease: "power2.out" }, "<");
    }

    document.querySelector(".start-btn").addEventListener("click", startStory, { once: true });
    if (typeof window.initInteractions === "function") window.initInteractions();
  }

  function startStory() {
    const opening = document.getElementById("opening-screen");
    const musicToggle = document.getElementById("music-toggle");

    if (typeof window.tryStartMusic === "function") window.tryStartMusic();

    opening.classList.add("hidden");
    unlockScroll();
    if (musicToggle) musicToggle.classList.add("visible");

    // Build the scroll-driven story only now — keeps the opening screen
    // snappy and avoids doing ScrollTrigger work behind a hidden layout.
    if (typeof window.initStoryAnimations === "function") {
      requestAnimationFrame(() => window.initStoryAnimations());
    }
  }

  function populateFinalMessage() {
    const msg = window.STORY && window.STORY.finalMessage;
    if (!msg) return;
    const l1 = document.getElementById("final-line-1");
    const l2 = document.getElementById("final-line-2");
    const p = document.getElementById("final-message-text");
    const more = document.getElementById("one-more-thing-text");
    if (l1) l1.textContent = msg.line1;
    if (l2) l2.textContent = msg.line2;
    if (p) p.textContent = msg.personal;
    if (more) more.textContent = msg.oneMoreThing;
  }

  function populateTimelineMilestones() {
    const items = window.STORY && window.STORY.timelineMilestones;
    const track = document.getElementById("timeline-track");
    if (!items || !track) return;
    const milestonesHost = track.querySelector(".milestones") || track;
    items.forEach((m) => {
      const div = document.createElement("div");
      div.className = "milestone";
      div.id = `milestone-${m.id}`;
      div.innerHTML = `
        <div class="milestone-dot">${m.icon}</div>
        <h3>${m.title}</h3>
        <p>${m.text}</p>
      `;
      milestonesHost.appendChild(div);
    });
  }

  // Global safety net: if GSAP/ScrollTrigger ever fail to load (e.g. CDN
  // blocked), fall back to a static, fully-readable page rather than a
  // blank/broken one.
  window.addEventListener("error", (e) => {
    if (/gsap|ScrollTrigger/i.test(e.message || "")) {
      document.body.classList.add("no-scroll-lock-fallback");
      unlockScroll();
    }
  });
})();
