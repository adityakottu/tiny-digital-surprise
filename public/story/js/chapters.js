/* ==========================================================================
   chapters.js — the five interactive chapters between the timeline and the
   closing scene: a quote, a scratch card, a letter, balloons and fireworks.

   Each chapter is independent. One failing must never take the others (or
   the story) down, so every initialiser is wrapped and bails quietly if its
   markup is absent. All copy comes from STORY.chapters; nothing here invents
   content.

   Everything is CSS transforms, SVG and 2D canvas — no WebGL, no libraries
   beyond the GSAP already vendored for the rest of the story. That keeps
   these chapters cheap on a phone, which matters because they sit after
   several screens of scrolling and the 3D scene.
   ========================================================================== */

(function () {
  "use strict";

  var REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function cfg() {
    return (window.STORY && window.STORY.chapters) || {};
  }

  /** Runs `fn`, and never lets one chapter's failure break the page. */
  function guard(name, fn) {
    try {
      fn();
    } catch (err) {
      console.warn("[chapters] " + name + " could not start:", err);
    }
  }

  /* ------------------------------------------------------------------ *
   * 1. Quote — a line revealed a word at a time as you scroll
   * ------------------------------------------------------------------ */

  function initQuote() {
    var section = document.getElementById("scene-quote");
    if (!section) return;
    var host = section.querySelector(".quote-words");
    var attrEl = section.querySelector(".quote-attr");
    var c = cfg().quote || {};
    if (!c.text) {
      section.remove();
      return;
    }

    // One span per word, so the reveal can travel through the sentence
    // instead of fading the whole block at once.
    var words = String(c.text).split(/\s+/);
    host.innerHTML = "";
    var spans = words.map(function (w) {
      var s = document.createElement("span");
      s.className = "quote-word";
      s.textContent = w;
      host.appendChild(s);
      host.appendChild(document.createTextNode(" "));
      return s;
    });

    if (attrEl) {
      if (c.attribution) attrEl.textContent = c.attribution;
      else attrEl.remove();
    }

    if (REDUCE || typeof gsap === "undefined" || !window.ScrollTrigger) {
      spans.forEach(function (s) { s.style.opacity = 1; s.style.filter = "none"; });
      return;
    }

    gsap.fromTo(
      spans,
      { opacity: 0.12, filter: "blur(5px)", y: 8 },
      {
        opacity: 1,
        filter: "blur(0px)",
        y: 0,
        ease: "none",
        stagger: 1,
        scrollTrigger: {
          trigger: section,
          start: "top 78%",
          end: "bottom 62%",
          scrub: 0.8,
        },
      }
    );
  }

  /* ------------------------------------------------------------------ *
   * 2. Scratch card
   * ------------------------------------------------------------------ */

  function initScratch() {
    var section = document.getElementById("scene-scratch");
    if (!section) return;
    var card = section.querySelector(".scratch-card");
    var canvas = section.querySelector(".scratch-canvas");
    var revealBtn = section.querySelector(".scratch-reveal-btn");
    var c = cfg().scratch || {};
    if (!card || !canvas) return;

    section.querySelectorAll("[data-scratch]").forEach(function (el) {
      var key = el.getAttribute("data-scratch");
      if (c[key]) el.textContent = c[key];
      else if (key === "sub" || key === "hint") el.remove();
    });

    var ctx = canvas.getContext("2d");
    if (!ctx) {
      // No 2D context at all: just show the message.
      card.classList.add("is-revealed");
      return;
    }

    var revealed = false;
    var drawing = false;
    var last = null;

    function paintFoil() {
      var r = card.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var g = ctx.createLinearGradient(0, 0, r.width, r.height);
      g.addColorStop(0, "#c8a2c8");
      g.addColorStop(0.35, "#8f6fa8");
      g.addColorStop(0.6, "#d9b3c4");
      g.addColorStop(1, "#7e5a86");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r.width, r.height);

      // A little speckle so it reads as foil rather than a flat panel.
      ctx.globalAlpha = 0.16;
      for (var i = 0; i < Math.round(r.width * r.height / 900); i++) {
        ctx.fillStyle = i % 2 ? "#ffffff" : "#4a2f52";
        ctx.fillRect(Math.random() * r.width, Math.random() * r.height, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    /** Fraction of the foil already scratched away, sampled on a grid. */
    function clearedFraction() {
      var step = 12;
      var w = canvas.width;
      var h = canvas.height;
      var data;
      try {
        data = ctx.getImageData(0, 0, w, h).data;
      } catch (e) {
        return 0; // tainted canvas — cannot measure, so never auto-reveal
      }
      var clear = 0;
      var total = 0;
      for (var y = 0; y < h; y += step) {
        for (var x = 0; x < w; x += step) {
          total++;
          if (data[(y * w + x) * 4 + 3] < 24) clear++;
        }
      }
      return total ? clear / total : 0;
    }

    function revealAll() {
      if (revealed) return;
      revealed = true;
      card.classList.add("is-revealed");
      if (revealBtn) revealBtn.remove();
      // Let CSS fade the canvas out, then drop it so it stops catching taps.
      setTimeout(function () {
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }, 700);
      card.dispatchEvent(new CustomEvent("scratch:revealed", { bubbles: true }));
    }

    function scratchAt(x, y) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 34;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (last) {
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.fill();
      last = { x: x, y: y };
    }

    function pointFrom(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (revealed) return;
      drawing = true;
      last = null;
      // Capture the pointer so a scratch that wanders off the card keeps
      // working, and — importantly on a phone — so the gesture belongs to
      // the card rather than turning into a page scroll halfway through.
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      var p = pointFrom(e);
      scratchAt(p.x, p.y);
      card.classList.add("is-scratching");
      e.preventDefault();
    });

    canvas.addEventListener("pointermove", function (e) {
      if (!drawing || revealed) return;
      var p = pointFrom(e);
      scratchAt(p.x, p.y);
      e.preventDefault();
    });

    function endStroke() {
      if (!drawing) return;
      drawing = false;
      last = null;
      card.classList.remove("is-scratching");
      // Past roughly half, finish it for them. Making someone scratch every
      // last corner is tedious, and the reveal should feel like a reward.
      if (clearedFraction() > 0.48) revealAll();
    }
    canvas.addEventListener("pointerup", endStroke);
    canvas.addEventListener("pointercancel", endStroke);
    canvas.addEventListener("pointerleave", endStroke);

    // Keyboard and reduced-motion route: the card must not be the only way in.
    if (revealBtn) revealBtn.addEventListener("click", revealAll);
    if (REDUCE) revealAll();

    paintFoil();

    // Repaint on resize, but only while still unscratched — repainting
    // afterwards would put the foil back over a message already read.
    var raf = 0;
    window.addEventListener("resize", function () {
      if (revealed) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paintFoil);
    });
  }

  /* ------------------------------------------------------------------ *
   * 3. Letter
   * ------------------------------------------------------------------ */

  function initLetter() {
    var section = document.getElementById("scene-letter");
    if (!section) return;
    var openBtn = section.querySelector(".letter-open");
    var wrap = section.querySelector(".letter-wrap");
    var closeBtn = section.querySelector(".letter-close");
    var c = cfg().letter || {};
    var final = (window.STORY && window.STORY.finalMessage) || {};
    if (!openBtn || !wrap) return;

    // Body falls back to the closing message you already wrote, rather than
    // asking for the same words twice.
    var body = c.body || final.personal || "";
    if (!body) {
      section.remove();
      return;
    }

    section.querySelectorAll("[data-letter]").forEach(function (el) {
      var key = el.getAttribute("data-letter");
      var val = key === "body" ? body : c[key];
      if (val) el.textContent = val;
      else el.remove();
    });

    var open = false;

    function setOpen(next) {
      open = next;
      wrap.classList.toggle("is-open", open);
      openBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        // Move focus into the letter so keyboard and screen-reader users
        // land on the thing that just appeared.
        var focusTarget = closeBtn || wrap;
        if (focusTarget && focusTarget.focus) focusTarget.focus({ preventScroll: true });
      } else {
        openBtn.focus({ preventScroll: true });
      }
    }

    openBtn.addEventListener("click", function () { setOpen(!open); });
    if (closeBtn) closeBtn.addEventListener("click", function () { setOpen(false); });

    section.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && open) setOpen(false);
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Balloons
   * ------------------------------------------------------------------ */

  function initBalloons() {
    var section = document.getElementById("scene-balloons");
    if (!section) return;
    var sky = section.querySelector(".balloon-sky");
    var titleEl = section.querySelector("[data-balloons='title']");
    var c = cfg().balloons || {};
    if (!sky) return;

    if (titleEl) {
      if (c.title) titleEl.textContent = c.title;
      else titleEl.remove();
    }

    var words = Array.isArray(c.words) ? c.words.slice(0) : [];
    // One balloon per word, no more: cycling the list to fill a quota meant
    // the same word appeared twice, which reads as a bug rather than emphasis.
    // Fewer on a phone, since a crowded sky is the first thing to cost frames
    // on a mid-range device.
    var narrow = window.innerWidth < 720;
    var count = narrow ? Math.min(words.length, 5) : words.length;
    if (!count) { section.remove(); return; }
    var palette = ["#e0607e", "#c9557f", "#a8628f", "#d98aa0", "#8f5a9e", "#e08a72", "#b8506a"];

    for (var i = 0; i < count; i++) {
      var word = words[i] || "";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "balloon";
      b.style.setProperty("--x", (6 + (88 / Math.max(1, count - 1)) * i).toFixed(1) + "%");
      b.style.setProperty("--c", palette[i % palette.length]);
      b.style.setProperty("--d", (0.9 + Math.random() * 1.6).toFixed(2) + "s");
      b.style.setProperty("--s", (0.82 + Math.random() * 0.36).toFixed(2));
      // Alternating lift, plus a little jitter: a straight line of balloons
      // looks placed, a ragged one looks released.
      b.style.setProperty("--lift", (i % 2 ? 9 : 0) + Math.round(Math.random() * 7) + "%");
      b.setAttribute("aria-label", word ? "Pop the balloon that says " + word : "Pop this balloon");
      b.innerHTML =
        '<span class="balloon-body" aria-hidden="true"></span>' +
        '<span class="balloon-string" aria-hidden="true"></span>' +
        (word ? '<span class="balloon-word">' + word + "</span>" : "");
      sky.appendChild(b);
    }

    var balloons = Array.prototype.slice.call(sky.querySelectorAll(".balloon"));

    // Pop on tap. The balloon is a real <button>, so this works from the
    // keyboard too without any extra handling.
    balloons.forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.classList.contains("is-popped")) return;
        b.classList.add("is-popped");
        b.setAttribute("aria-disabled", "true");
        b.tabIndex = -1;
      });
    });

    if (REDUCE || typeof gsap === "undefined" || !window.ScrollTrigger) {
      balloons.forEach(function (b) { b.style.opacity = 1; b.style.transform = "none"; });
      return;
    }

    // They drift up as you scroll — the scroll lifts them, rather than a
    // loop playing regardless of where the reader is.
    gsap.fromTo(
      balloons,
      { yPercent: 48, opacity: 0 },
      {
        yPercent: -34,
        opacity: 1,
        ease: "none",
        stagger: 0.12,
        scrollTrigger: {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
      }
    );
  }

  /* ------------------------------------------------------------------ *
   * 5. Fireworks + the surprise word
   * ------------------------------------------------------------------ */

  function initFireworks() {
    var section = document.getElementById("scene-fireworks");
    if (!section) return;
    var canvas = section.querySelector(".fw-canvas");
    var wordHost = section.querySelector(".fw-word");
    var lineEl = section.querySelector("[data-fw='line']");
    var c = cfg().fireworks || {};

    if (lineEl) {
      if (c.line) lineEl.textContent = c.line;
      else lineEl.remove();
    }

    // One span per letter so the word can land character by character.
    if (wordHost) {
      var word = c.word || "";
      wordHost.innerHTML = "";
      if (!word) wordHost.remove();
      else {
        wordHost.setAttribute("aria-label", word);
        word.split("").forEach(function (ch) {
          var s = document.createElement("span");
          s.className = "fw-letter";
          s.setAttribute("aria-hidden", "true");
          s.textContent = ch === " " ? " " : ch;
          wordHost.appendChild(s);
        });
      }
    }

    var letters = Array.prototype.slice.call(section.querySelectorAll(".fw-letter"));

    if (REDUCE) {
      letters.forEach(function (l) { l.style.opacity = 1; l.style.transform = "none"; });
      if (canvas) canvas.remove();
      return;
    }

    if (typeof gsap !== "undefined" && window.ScrollTrigger && letters.length) {
      gsap.fromTo(
        letters,
        { opacity: 0, y: 26, scale: 0.86 },
        {
          opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.06, ease: "back.out(1.7)",
          scrollTrigger: { trigger: section, start: "top 62%", toggleActions: "play none none reverse" },
        }
      );
    } else {
      letters.forEach(function (l) { l.style.opacity = 1; });
    }

    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); return; }

    var W = 0, H = 0, dpr = 1;
    function size() {
      var r = section.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();

    var narrow = window.innerWidth < 720;
    var PER_BURST = narrow ? 26 : 46;
    var MAX_PARTICLES = narrow ? 260 : 620;
    var HUES = [345, 330, 12, 44, 280, 210];
    var parts = [];
    var raf = 0;
    var running = false;
    var nextBurst = 0;

    function burst(x, y) {
      if (parts.length > MAX_PARTICLES) return;
      var hue = HUES[Math.floor(Math.random() * HUES.length)];
      for (var i = 0; i < PER_BURST; i++) {
        var a = (Math.PI * 2 * i) / PER_BURST + Math.random() * 0.2;
        var sp = 1.6 + Math.random() * 3.1;
        parts.push({
          x: x, y: y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          decay: 0.008 + Math.random() * 0.012,
          hue: hue + (Math.random() * 20 - 10),
        });
      }
    }

    function frame(ts) {
      raf = requestAnimationFrame(frame);

      // Trails rather than a hard clear: cheaper than redrawing a background
      // and it gives the sparks their fade for free.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      if (ts > nextBurst) {
        burst(W * (0.18 + Math.random() * 0.64), H * (0.16 + Math.random() * 0.42));
        nextBurst = ts + 620 + Math.random() * 900;
      }

      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.vy += 0.028;            // gravity
        p.vx *= 0.985;            // drag
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.fillStyle = "hsla(" + p.hue + ",92%,64%," + Math.max(0, p.life) + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function start() {
      if (running) return;
      running = true;
      nextBurst = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      parts.length = 0;
      ctx.clearRect(0, 0, W, H);
    }

    // Only while on screen. A particle loop running behind three screens of
    // scrolled-past content is pure battery burn.
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !document.hidden) start();
        else stop();
      }, { threshold: 0.12 });
      io.observe(section);
    } else {
      start();
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
    });

    var rs = 0;
    window.addEventListener("resize", function () {
      cancelAnimationFrame(rs);
      rs = requestAnimationFrame(size);
    });
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  var started = false;

  window.initChapters = function () {
    if (started) return;   // same double-bind trap the loader had
    started = true;
    guard("quote", initQuote);
    guard("scratch card", initScratch);
    guard("letter", initLetter);
    guard("balloons", initBalloons);
    guard("fireworks", initFireworks);
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  };
})();
