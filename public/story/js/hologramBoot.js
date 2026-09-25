/**
 * hologramBoot.js — classic (non-module) entry point for the hologram scene.
 *
 * Kept separate from the ES modules for one reason: Three.js is ~133 KB
 * gzipped, and most of this page's readers are on a phone opening a gift link
 * over mobile data. Nobody should pay for that until they are actually about
 * to see the hologram, so this small script watches for the section
 * approaching and only then dynamically imports the real code.
 *
 * It also owns every way the experience can fail — no WebGL, a slow or broken
 * import, a thrown error during setup. In all of them the section falls back
 * to a CSS silhouette rather than leaving a blank hole in the story.
 */
(function () {
  "use strict";

  var SECTION_ID = "scene-hologram";

  // Resolve sibling modules relative to this script, so the same file works
  // from /story/js/ in the app and from js/ in the standalone copy.
  var here = (document.currentScript && document.currentScript.src) || "";
  var base = here.replace(/[^/]*$/, "");

  function markFallback(section, reason) {
    section.classList.add("holo-fallback");
    section.setAttribute("data-holo-reason", reason);
  }

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

    var canvas = section.querySelector(".holo-canvas");
    if (!canvas) return;

    if (!hasWebGL()) {
      markFallback(section, "no-webgl");
      return;
    }

    // Dynamic import needs a modern engine; if the browser cannot parse the
    // modules at all, the catch below hands it the CSS fallback.
    var started = false;

    var startOnce = function () {
      if (started) return;
      started = true;

      Promise.all([
        import(base + "hologram.js"),
        import(base + "hologramAnimation.js"),
        import(base + "hologramInteraction.js"),
      ])
        .then(function (mods) {
          var holo = mods[0];
          var anim = mods[1];
          var interact = mods[2];

          // Passport photos, if the gift supplied them. Read from the same
          // GIFT_OVERRIDE the rest of the story uses, so a personalised gift
          // and the standalone copy configure faces identically.
          var id = (window.GIFT_OVERRIDE && window.GIFT_OVERRIDE.identity) ||
                   (window.STORY && window.STORY.identity) || {};
          var faces = {
            male: id.senderPhoto || section.getAttribute("data-face-male") || null,
            female: id.recipientPhoto || section.getAttribute("data-face-female") || null,
          };

          return holo.initHologramScene(canvas, { faces: faces }).then(function (h) {
            var ctrl = anim.createDanceTimeline(h, section, {
              distance: section.getAttribute("data-holo-distance") || "+=360%",
            });
            var pointer = interact.initHologramInteraction(h, section);

            section.classList.add("holo-ready");

            // Exposed so the page (or a console) can tear the scene down
            // explicitly; also used by the story's replay button.
            window.__hologram = {
              handle: h,
              // Exposed for debugging and for automated checks: the live
              // scroll progress the whole scene is posed from.
              get progress() { return ctrl.state ? ctrl.state.p : null; },
              destroy: function () {
                pointer.destroy();
                ctrl.destroy();
                section.classList.remove("holo-ready");
                window.__hologram = null;
              },
            };
          });
        })
        .catch(function (err) {
          console.warn("[hologram] failed to start:", err);
          markFallback(section, "init-failed");
        });
    };

    // Preload a little before the section arrives so the reveal is not the
    // first thing waiting on a network round-trip.
    var arm = function () {
      if (!("IntersectionObserver" in window)) return startOnce();
      var io = new IntersectionObserver(
        function (entries) {
          if (entries[0].isIntersecting) {
            io.disconnect();
            startOnce();
          }
        },
        { rootMargin: "800px 0px" }
      );
      io.observe(section);
    };

    // Wait for the story proper to begin before measuring anything.
    //
    // The story builds its own pinned ScrollTriggers only when the reader
    // presses "Start Our Story", and pinning inserts a spacer several
    // viewports tall. Arm the observer before that and this section is still
    // sitting near the top of the document, so our own ScrollTrigger measures
    // a position that is about to change and the two pins end up overlapping.
    // Waiting also means the reader never downloads Three.js for a story they
    // did not open.
    var opening = document.getElementById("opening-screen");
    if (!opening || opening.classList.contains("hidden")) {
      arm();
      return;
    }

    var armed = false;
    var armAfterStory = function () {
      if (armed) return;
      armed = true;
      mo.disconnect();
      // Two frames: one for the story's own requestAnimationFrame(initStory-
      // Animations), one for the layout it produces to settle.
      requestAnimationFrame(function () {
        requestAnimationFrame(arm);
      });
    };

    var mo = new MutationObserver(function () {
      if (opening.classList.contains("hidden")) armAfterStory();
    });
    mo.observe(opening, { attributes: true, attributeFilter: ["class"] });

    // Belt and braces: if the opening screen is ever removed rather than
    // hidden, or the markup changes, still come up rather than never showing.
    document.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest(".start-btn")) {
        setTimeout(armAfterStory, 120);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
