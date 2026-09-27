/* ==========================================================================
   scrollRefresh.js — re-measure every ScrollTrigger, in the right order.

   THE BUG THIS EXISTS FOR

   This story creates its pinned sections at different times: the story's own
   pins when the reader presses "Enter Our Story", the chapter pins right
   after, and the hologram's pin much later — lazily, when the reader is
   nearly there, because it costs 158KB of Three.js.

   Every pin inserts a spacer several screens tall, which pushes everything
   below it down. So each new pin means every trigger below it has to
   re-measure, which is what ScrollTrigger.refresh() is for.

   Except refresh() re-measures triggers in the order ScrollTrigger holds
   them, and that order is the order they were CREATED. When a pin is created
   out of document order — as the lazily-booted hologram is, above a chapter
   that was set up earlier — the later section gets re-measured BEFORE the
   earlier one has re-applied its spacing, so it measures against a layout
   that is about to change and keeps its stale start position.

   What that looked like on the page: the cinema chapter believed it was
   pinned from 1688px to 4220px while its spacer actually sat at 10635px. So
   it played its images on top of the earlier story section, and left 2532px
   — three screens — of empty space where it should have been. That is the
   "gap after the hologram" this fixes.

   Why the order has to come from the DOM, not from the triggers' own numbers:
   a refresh reverts every pin to its natural position, measures each trigger
   in turn, and re-applies pin spacing as it goes. A section is therefore only
   measured correctly once every pin ABOVE it has had its spacing restored,
   which means document order. ScrollTrigger.sort() with no argument sorts by
   each trigger's cached start — and those are precisely the values that are
   wrong when this is needed, so it can hand back the same broken order. The
   comparator below asks the DOM instead, which cannot be stale.

   Always call this instead of ScrollTrigger.refresh().
   ========================================================================== */
(function () {
  "use strict";

  function inDocumentOrder(a, b) {
    var A = a.trigger || a.pin;
    var B = b.trigger || b.pin;
    if (!A || !B || A === B) return 0;
    var rel = A.compareDocumentPosition(B);
    if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;  // A is above B
    if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;   // A is below B
    return 0;
  }

  window.refreshScrollTriggers = function () {
    var ST = window.ScrollTrigger;
    if (!ST) return;
    // Order first, then measure. Doing it the other way round is the bug.
    if (typeof ST.sort === "function") {
      try {
        ST.sort(inDocumentOrder);
      } catch (e) {
        // A GSAP build that will not take a comparator is no reason to skip
        // the refresh itself.
        try { ST.sort(); } catch (e2) { /* nothing more to try */ }
      }
    }
    ST.refresh();
  };
})();
