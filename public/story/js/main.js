/* ==========================================================================
   main.js — boot sequence. Loads last (after story.js, animations.js,
   audio.js, interactions.js are all defined), wires the loading screen,
   the opening screen, and hands off to the other modules once the user
   taps "Start Our Story".
   ========================================================================== */

(function () {
  /** The builder caps a sender at ten; the story enforces it too. */
  const MAX_MILESTONES = 10;

  function boot() {
    populateIdentity();
    populateFinalMessage();
    populateTimelineMilestones();
    lockScroll();
    runLoadingScreen();
  }
  // Static page load: this script runs before DOMContentLoaded fires, so
  // wait for it. Dynamically injected (e.g. mounted into a React page
  // after the document has already loaded): readyState is already past
  // "loading", so DOMContentLoaded will never fire again — boot right away.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  function populateIdentity() {
    const id = window.STORY && window.STORY.identity;
    if (!id) return;
    const eyebrow = document.querySelector(".opening-eyebrow");
    const sub = document.querySelector(".opening-sub");
    const footer = document.querySelector(".site-footer");
    if (eyebrow) eyebrow.textContent = id.recipientName ? `Hey ${id.recipientName} ❤️` : "Hey ❤️";
    if (sub) sub.textContent = id.openingLine || "I made something special for you…";
    if (footer) footer.textContent = id.senderName ? `Made with love, from ${id.senderName}. · Tiny Digital Surprise` : "Made with love, for you. · Tiny Digital Surprise";
  }

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
    // The safety-net timeout below can fire after the load event has already
    // run finish(), so this has to be idempotent. Without the guard the whole
    // opening sequence ran twice and every click handler was bound twice —
    // which silently broke "One More Thing…", because two toggle listeners
    // turn the panel on and straight back off again.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
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
      // A paced entrance rather than three things arriving at once: the
      // greeting lands, holds, and only then does the line resolve out of
      // blur and the invitation appear.
      gsap.timeline()
        .fromTo(eyebrow,
          { opacity: 0, y: 16, filter: "blur(10px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.5, ease: "power2.out" })
        .fromTo(sub,
          { opacity: 0, y: 12, filter: "blur(12px)" },
          { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.4, ease: "power2.out" },
          "+=0.45")
        .fromTo(btn,
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" },
          "+=0.35");
    }

    document.querySelector(".start-btn").addEventListener("click", startStory, { once: true });
    if (typeof window.initInteractions === "function") window.initInteractions();
    if (typeof window.initChapters === "function") window.initChapters();
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

  /**
   * Builds the timeline chapter from whatever milestones the gift carries.
   *
   * Two presentations, chosen by the content rather than by a setting:
   *
   *  - No photos: the vertical timeline this chapter has always been, a dot
   *    and a line and a card per milestone, revealed one at a time as the
   *    reader scrolls.
   *  - With photos: the same milestones, but each one gets the screen to
   *    itself with its photograph — a pinned stage the reader steps through.
   *    A photo shrunk into a 40px-wide list row is not worth uploading.
   *
   * Titles and text are set with textContent, never innerHTML: this copy is
   * written by the sender and arrives from the database, so interpolating it
   * into markup would let a "<img onerror=...>" in a milestone title run in
   * the recipient's browser.
   */
  function populateTimelineMilestones() {
    const all = window.STORY && window.STORY.timelineMilestones;
    const track = document.getElementById("timeline-track");
    const section = document.getElementById("timeline-section");
    if (!all || !track) return;

    // Guard the list itself: a sender can write their own, and an empty or
    // malformed entry should drop out rather than render a blank card.
    const items = all
      .filter((m) => m && (m.title || m.text || m.photo))
      .slice(0, MAX_MILESTONES);
    if (!items.length) {
      if (section) section.remove();
      return;
    }

    const withPhotos = items.some((m) => m.photo);
    if (section && withPhotos) section.classList.add("has-photos");

    const host = track.querySelector(".milestones") || track;
    items.forEach((m, i) => {
      const item = document.createElement("article");
      item.className = "milestone";
      item.id = `milestone-${m.id || i + 1}`;

      const dot = document.createElement("div");
      dot.className = "milestone-dot";
      dot.textContent = m.icon || "\u2726";
      dot.setAttribute("aria-hidden", "true");
      item.appendChild(dot);

      const card = document.createElement("div");
      card.className = "milestone-card";

      if (m.photo) {
        const fig = document.createElement("figure");
        fig.className = "milestone-photo";
        const img = document.createElement("img");
        img.src = m.photo;
        img.alt = m.title ? `Photo: ${m.title}` : "";
        img.loading = i === 0 ? "eager" : "lazy";
        img.decoding = "async";
        // A photo that will not load must leave the card readable rather
        // than a broken frame in the middle of the story.
        img.addEventListener("error", () => fig.remove());
        fig.appendChild(img);
        card.appendChild(fig);
      }

      const h3 = document.createElement("h3");
      h3.textContent = m.title || "";
      card.appendChild(h3);

      if (m.text) {
        const para = document.createElement("p");
        para.textContent = m.text;
        card.appendChild(para);
      }

      item.appendChild(card);
      host.appendChild(item);
    });

    // A step control, so the chapter can be walked without guessing how far
    // to scroll. Only worth showing when there is more than one step.
    if (items.length > 1) {
      const next = document.createElement("button");
      next.type = "button";
      next.className = "milestone-next";
      next.setAttribute("aria-label", "Next milestone");
      next.innerHTML =
        '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 5v14M6 13l6 6 6-6"/></svg>';
      track.appendChild(next);
    }
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
