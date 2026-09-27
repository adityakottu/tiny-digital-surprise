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
   * 0. Cinema — pre-rendered scenes, crossfaded and pushed in by scroll
   * ------------------------------------------------------------------ */

  function initCinema() {
    var section = document.getElementById("scene-cinema");
    if (!section) return;
    var stage = section.querySelector(".cinema-stage");
    var lineEl = section.querySelector(".cinema-line");
    var cfg = (window.STORY && window.STORY.cinema) || {};
    var scenes = (cfg.scenes || []).filter(function (s) { return s && s.src; });
    if (!stage || !scenes.length) { section.remove(); return; }

    // Asset path comes from the markup, because the standalone copy serves
    // from assets/ and the app from /story/assets/.
    var base = section.getAttribute("data-cinema-base") || "assets/scenes/";

    var layers = scenes.map(function (sc, i) {
      var layer = document.createElement("div");
      layer.className = "cinema-layer";
      layer.style.setProperty("--focus", sc.focus || "50% 40%");

      // Art direction, not just resizing. A landscape source filled into a
      // portrait phone loses two thirds of its width, which cropped a face in
      // half — so portrait viewports get a deliberately cropped 3:4 variant
      // instead, chosen at build time around the busiest part of the frame.
      var pic = document.createElement("picture");

      var pWebp = document.createElement("source");
      pWebp.media = "(orientation: portrait)";
      pWebp.type = "image/webp";
      pWebp.srcset = base + sc.src + "-p-780.webp 780w, " + base + sc.src + "-p-1080.webp 1080w";
      pWebp.sizes = "100vw";

      var pJpg = document.createElement("source");
      pJpg.media = "(orientation: portrait)";
      pJpg.type = "image/jpeg";
      pJpg.srcset = base + sc.src + "-p-780.jpg 780w, " + base + sc.src + "-p-1080.jpg 1080w";
      pJpg.sizes = "100vw";

      var webp = document.createElement("source");
      webp.type = "image/webp";
      webp.srcset = base + sc.src + "-900.webp 900w, " + base + sc.src + "-1200.webp 1200w, " +
                    base + sc.src + "-1600.webp 1600w";
      webp.sizes = "100vw";

      var img = document.createElement("img");
      img.srcset = base + sc.src + "-900.jpg 900w, " + base + sc.src + "-1200.jpg 1200w, " +
                   base + sc.src + "-1600.jpg 1600w";
      img.sizes = "100vw";
      img.src = base + sc.src + "-900.jpg";
      img.alt = "";              // decorative: the caption carries the meaning
      // The first scene is what the reader is about to look at; the rest can
      // wait until the browser has spare capacity.
      img.loading = i === 0 ? "eager" : "lazy";
      img.decoding = "async";
      img.addEventListener("load", function () { layer.classList.add("is-loaded"); });
      img.addEventListener("error", function () { layer.classList.add("is-failed"); });

      // Order matters: the browser takes the first <source> whose media and
      // type it supports, so the portrait crops must come before the wide ones.
      pic.appendChild(pWebp);
      pic.appendChild(pJpg);
      pic.appendChild(webp);
      pic.appendChild(img);
      layer.appendChild(pic);
      stage.appendChild(layer);
      return layer;
    });

    // Caption text lives in one element that swaps as the scenes change, so
    // there is never more than one line on screen.
    var setLine = function (i) {
      if (!lineEl) return;
      var text = scenes[i] && scenes[i].line;
      if (lineEl.textContent === text) return;
      lineEl.textContent = text || "";
    };
    setLine(0);

    if (REDUCE || typeof gsap === "undefined" || !window.ScrollTrigger) {
      // Reduced motion: no pin, no crossfade. Show the scenes stacked as a
      // short gallery with their lines, which still tells the same story.
      section.classList.add("is-static");
      layers.forEach(function (l, i) {
        l.style.opacity = 1;
        var cap = document.createElement("p");
        cap.className = "cinema-static-line";
        cap.textContent = scenes[i].line || "";
        l.appendChild(cap);
      });
      if (lineEl) lineEl.remove();
      return;
    }

    var state = { p: 0 };
    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: section.getAttribute("data-cinema-distance") || "+=300%",
        scrub: 0.8,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
      defaults: { ease: "none" },
    });
    tl.to(state, { p: 1, duration: 100 }, 0);

    // Crossfade and a slow push in, both computed from progress rather than
    // tweened per layer: any scroll position then produces the right frame,
    // and scrolling back up reverses exactly.
    var n = layers.length;
    var apply = function () {
      var t = state.p * n;            // 0..n across the scenes
      var current = Math.min(n - 1, Math.floor(t));
      for (var i = 0; i < n; i++) {
        // Distance from this layer's own slot, in slots.
        var d = t - i;
        // Visible across its slot with a soft shoulder either side.
        var o = 1 - Math.min(1, Math.abs(d - 0.5) / 0.85);
        // The outermost scenes must not be half-faded at the very ends of the
        // section: the curve is centred on each slot's midpoint, so without
        // this the reader's first and last frames show the artwork at about
        // half opacity over black. Hold the ends fully opaque instead.
        if (i === 0 && d < 0.5) o = 1;
        if (i === n - 1 && d > 0.5) o = 1;
        layers[i].style.opacity = String(Math.max(0, Math.min(1, o * 1.25)));
        // Ken Burns: each scene drifts in slowly while it is on screen.
        var k = Math.max(0, Math.min(1, d));
        layers[i].style.transform = "scale(" + (1.06 + k * 0.08).toFixed(4) + ")";
      }
      setLine(current);
    };
    tl.eventCallback("onUpdate", apply);
    apply();

    // ScrollTrigger measures this section before the images have laid out, and
    // pinning shifts everything below it.
    if (window.refreshScrollTriggers) window.refreshScrollTriggers();
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

  /* ------------------------------------------------------------------ *
   * The two portraits, shown as photographs
   * ------------------------------------------------------------------ */

  /**
   * Puts the sender's and recipient's passport photos into the final scene.
   *
   * Why this exists: the photos are already projected onto the holographic
   * couple's faces, but a hologram turns a face into tinted light on purpose,
   * and at the wide framing a head is only about 50px across. So a sender who
   * uploaded two photos could reasonably conclude they had not been used at
   * all. Here they appear as themselves, once, at the end — next to the names
   * they belong to.
   *
   * Reads the same source the hologram does, so a personalised gift and the
   * standalone copy behave identically, and the whole block is removed when
   * there are no photos rather than leaving two empty frames.
   */
  function initPortraits() {
    var wrap = document.getElementById("final-portraits");
    if (!wrap) return;

    var id = (window.GIFT_OVERRIDE && window.GIFT_OVERRIDE.identity) ||
             (window.STORY && window.STORY.identity) || {};

    var pairs = [
      { url: id.senderPhoto, name: id.senderName, img: "portrait-sender", cap: "portrait-sender-name", fallback: "Me" },
      { url: id.recipientPhoto, name: id.recipientName, img: "portrait-recipient", cap: "portrait-recipient-name", fallback: "You" },
    ];

    var shown = 0;
    pairs.forEach(function (pr) {
      var img = document.getElementById(pr.img);
      var cap = document.getElementById(pr.cap);
      var fig = img && img.closest ? img.closest(".portrait") : null;
      if (!img) return;
      if (!pr.url) {
        // One photo and not the other is a normal thing to send, so drop just
        // that frame instead of the pair.
        if (fig && fig.parentNode) fig.parentNode.removeChild(fig);
        return;
      }
      img.src = pr.url;
      // The alt text carries who it is, since the caption may be styled out.
      img.alt = pr.name ? "Photo of " + pr.name : "One of the two of you";
      if (cap) cap.textContent = pr.name || pr.fallback;
      // A photo that will not load must not leave a broken frame at the
      // emotional high point of the page.
      img.addEventListener("error", function () {
        if (fig && fig.parentNode) fig.parentNode.removeChild(fig);
        if (!wrap.querySelector(".portrait")) wrap.hidden = true;
      });
      shown += 1;
    });

    if (!shown) {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      return;
    }
    // With only one portrait the heart between them has nothing to join.
    if (shown < 2) {
      var link = wrap.querySelector(".portrait-link");
      if (link && link.parentNode) link.parentNode.removeChild(link);
    }
    wrap.hidden = false;
  }

  window.initChapters = function () {
    if (started) return;   // same double-bind trap the loader had
    started = true;
    guard("portraits", initPortraits);
    guard("cinema", initCinema);
    guard("quote", initQuote);
    guard("scratch card", initScratch);
    guard("letter", initLetter);
    guard("balloons", initBalloons);
    guard("fireworks", initFireworks);
    if (window.refreshScrollTriggers) window.refreshScrollTriggers();
  };
})();
