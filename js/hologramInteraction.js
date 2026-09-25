/**
 * hologramInteraction.js — optional pointer parallax.
 *
 * Deliberately tiny in effect. The scroll is the interaction; this only adds
 * the faint sense that the projection sits in real space in front of you.
 *
 * On touch devices it does nothing at all. Anything that listens to touch
 * here risks competing with the page scroll, and on a phone the scroll must
 * win every time.
 */

const MAX_X = 0.34;  // world units the camera may drift sideways
const MAX_Y = 0.16;

export function initHologramInteraction(h, section) {
  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  h.parallax = h.parallax || { x: 0, y: 0 };

  if (!fine || reduced) {
    return { destroy() {} };
  }

  const target = { x: 0, y: 0 };
  let raf = 0;

  const onMove = (e) => {
    const r = section.getBoundingClientRect();
    // -1..1 across the section, so the effect is centred on the hologram
    // rather than on the viewport.
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    target.x = Math.max(-1, Math.min(1, nx)) * MAX_X;
    target.y = -Math.max(-1, Math.min(1, ny)) * MAX_Y;
  };

  const onLeave = () => {
    target.x = 0;
    target.y = 0;
  };

  // Ease toward the target instead of snapping — an instant response to the
  // pointer reads as jitter at this scale.
  const tick = () => {
    raf = requestAnimationFrame(tick);
    h.parallax.x += (target.x - h.parallax.x) * 0.045;
    h.parallax.y += (target.y - h.parallax.y) * 0.045;
  };
  raf = requestAnimationFrame(tick);

  window.addEventListener("pointermove", onMove, { passive: true });
  section.addEventListener("pointerleave", onLeave);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      h.parallax.x = 0;
      h.parallax.y = 0;
    },
  };
}
