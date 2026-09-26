/* ==========================================================================
   interactions.js — micro-interactions: floating particles, heart taps,
   button hover glow, image tilt, scroll indicator, replay / one-more-thing.
   Kept deliberately restrained per spec §10 ("premium, not a template full
   of effects").
   ========================================================================== */

(function () {
  const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function spawnOpeningParticles() {
    if (REDUCE_MOTION) return;
    const host = document.querySelector(".opening-particles");
    if (!host) return;
    const glyphs = ["♥", "♡"];
    const count = window.innerWidth < 480 ? 10 : 16;
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      span.className = "p";
      span.textContent = glyphs[i % glyphs.length];
      const left = Math.random() * 100;
      const size = 10 + Math.random() * 16;
      const duration = 9 + Math.random() * 8;
      const delay = Math.random() * 10;
      const dx = (Math.random() * 60 - 30) + "px";
      span.style.left = left + "vw";
      span.style.fontSize = size + "px";
      span.style.color = i % 3 === 0 ? "var(--gold)" : "var(--rose)";
      span.style.setProperty("--dx", dx);
      span.style.setProperty("--o", (0.35 + Math.random() * 0.4).toFixed(2));
      span.style.animationDuration = duration + "s";
      span.style.animationDelay = delay + "s";
      host.appendChild(span);
    }
  }

  function tapHeartBurst() {
    const finalScene = document.getElementById("final-scene");
    if (!finalScene) return;
    finalScene.addEventListener("click", (e) => {
      if (REDUCE_MOTION) return;
      if (e.target.closest(".final-btn")) return; // don't fight the buttons
      const heart = document.createElement("span");
      heart.className = "heart-pop";
      heart.textContent = "♥";
      heart.style.left = e.clientX + "px";
      heart.style.top = e.clientY + "px";
      heart.style.color = Math.random() > 0.5 ? "var(--rose)" : "var(--gold)";
      heart.style.fontSize = (16 + Math.random() * 14) + "px";
      document.body.appendChild(heart);
      heart.addEventListener("animationend", () => heart.remove());
    });
  }

  function tiltOnHover() {
    if (REDUCE_MOTION || window.matchMedia("(hover: none)").matches) return;
    document.querySelectorAll(".tilt").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateX(${(-py * 8).toFixed(2)}deg) rotateY(${(px * 8).toFixed(2)}deg)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  function wireFinalActions() {
    const replayBtn = document.getElementById("replay-btn");
    const moreBtn = document.getElementById("more-btn");
    const morePanel = document.getElementById("one-more-thing");

    if (replayBtn) {
      replayBtn.addEventListener("click", () => {
        // Scrolling to the top alone left every scrubbed timeline sitting at
        // its end state, so the "replay" showed the finished story rather
        // than replaying it. Reset the scene, then let ScrollTrigger
        // re-measure from the top.
        const morePanel = document.getElementById("one-more-thing");
        const moreButton = document.getElementById("more-btn");
        if (morePanel) morePanel.classList.remove("show");
        if (moreButton) moreButton.textContent = "One More Thing…";

        // Tear the 3D scene down; it re-arms itself when the section is
        // approached again, which also frees its GPU memory in between.
        if (window.__hologram && typeof window.__hologram.destroy === "function") {
          try { window.__hologram.destroy(); } catch (e) { /* already gone */ }
        }

        window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? "auto" : "smooth" });

        // Refresh once the scroll has actually settled, not on a guessed
        // delay. The story is now well over ten screens tall, so a smooth
        // scroll back to the top can take a couple of seconds — a fixed
        // timeout fires mid-flight and re-measures the pinned sections
        // against a position the page is still moving away from.
        if (window.ScrollTrigger) {
          if (REDUCE_MOTION) {
            setTimeout(() => window.ScrollTrigger.refresh(), 60);
          } else {
            let stable = 0;
            let lastY = -1;
            const settle = setInterval(() => {
              const y = window.scrollY;
              stable = y === lastY ? stable + 1 : 0;
              lastY = y;
              // Three consecutive identical readings, or five seconds,
              // whichever comes first.
              if (stable >= 3 || (stable += 0) > 60) {
                clearInterval(settle);
                window.ScrollTrigger.refresh();
              }
            }, 100);
            setTimeout(() => clearInterval(settle), 5000);
          }
        }
      });
    }
    if (moreBtn && morePanel) {
      moreBtn.addEventListener("click", () => {
        morePanel.classList.toggle("show");
        moreBtn.textContent = morePanel.classList.contains("show") ? "Hide" : "One More Thing…";
      });
    }
  }

  // Belt and braces against double-binding: even if a caller invokes this
  // twice, the listeners must only ever be attached once.
  let wired = false;

  window.initInteractions = function () {
    if (wired) return;
    wired = true;
    spawnOpeningParticles();
    tapHeartBurst();
    tiltOnHover();
    wireFinalActions();
  };
})();
