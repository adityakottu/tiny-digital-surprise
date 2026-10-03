/* ==========================================================================
   storyCoupleBoot.js — brings the 3D couple into chapter one.

   Classic script, like hologramBoot.js and for the same reason: Three.js is
   158KB and nobody should pay for it until the story is actually opened.

   The SVG couple stays in the markup and stays visible until the 3D pair is
   on screen, then hands over. That is not a nicety — it is the fallback. No
   WebGL, a blocked import, a thrown error during setup: the SVG is simply
   never hidden and the chapter looks exactly as it did before.

   Loading starts when the reader presses "Enter Our Story", not when the
   chapter scrolls into view, because chapter one IS the first thing they
   see. The opening animation covers the download.
   ========================================================================== */
(function () {
  "use strict";

  var SECTION_ID = "scene-story";

  var here = (document.currentScript && document.currentScript.src) || "";
  var base = here.replace(/[^/]*$/, "");

  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(
        window.WebGLRenderingContext &&
        (c.getContext("webgl") || c.getContext("experimental-webgl"))
      );
    } catch (e) {
      return false;
    }
  }

  function boot() {
    var section = document.getElementById(SECTION_ID);
    if (!section) return;
    var canvas = section.querySelector(".story-couple-canvas");
    var figures = section.querySelector(".figures");
    if (!canvas || !figures) return;

    var reduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion keeps the still SVG rather than a live render loop.
    if (reduced || !hasWebGL()) return;

    var started = false;
    var start = function () {
      if (started) return;
      started = true;

      import(base + "storyCouple.js")
        .then(function (mod) {
          return mod.initStoryCouple(canvas).then(function (h) {
            section.classList.add("couple-3d");   // fades the SVG out

            var raf = 0;
            var running = false;
            var clock = 0;
            var last = 0;
            var progress = 0;

            // Chapter one is pinned and scrubbed by animations.js. Rather
            // than add a second ScrollTrigger that could disagree with it,
            // the progress is read from the pin itself each frame.
            var trigger = null;
            var findTrigger = function () {
              if (!window.ScrollTrigger) return null;
              var all = window.ScrollTrigger.getAll();
              for (var i = 0; i < all.length; i++) {
                if (all[i].trigger === section && all[i].pin) return all[i];
              }
              return null;
            };

            var frame = function (ts) {
              raf = requestAnimationFrame(frame);
              if (!last) last = ts;
              clock += Math.min(0.05, (ts - last) / 1000);
              last = ts;
              if (!trigger) trigger = findTrigger();
              if (trigger) progress = trigger.progress;
              mod.poseStoryCouple(h, progress, clock);
              h.renderer.render(h.scene, h.camera);
            };

            var play = function () {
              if (running) return;
              running = true;
              last = 0;
              raf = requestAnimationFrame(frame);
            };
            var pause = function () {
              if (!running) return;
              running = false;
              cancelAnimationFrame(raf);
            };

            // Off screen, off the clock: the chapter is a fifth of the story
            // and the reader spends most of it elsewhere.
            if ("IntersectionObserver" in window) {
              new IntersectionObserver(
                function (entries) { entries[0].isIntersecting ? play() : pause(); },
                { rootMargin: "200px 0px" }
              ).observe(section);
            } else {
              play();
            }

            var onResize = function () { mod.resizeStoryCouple(h); };
            window.addEventListener("resize", onResize);

            window.__storyCouple = {
              handle: h,
              destroy: function () {
                pause();
                window.removeEventListener("resize", onResize);
                section.classList.remove("couple-3d");
                mod.destroyStoryCouple(h);
                window.__storyCouple = null;
              },
            };
          });
        })
        .catch(function (err) {
          // The SVG was never hidden, so there is nothing to undo.
          console.warn("[story couple] failed to start:", err);
          section.setAttribute("data-couple-reason", "init-failed");
        });
    };

    var opening = document.getElementById("opening-screen");
    if (!opening || opening.classList.contains("hidden")) return start();

    var mo = new MutationObserver(function () {
      if (opening.classList.contains("hidden")) {
        mo.disconnect();
        start();
      }
    });
    mo.observe(opening, { attributes: true, attributeFilter: ["class"] });

    document.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".start-btn")) {
        setTimeout(start, 120);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
