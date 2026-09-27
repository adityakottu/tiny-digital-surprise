/* ==========================================================================
   audio.js — background music, gated behind user interaction.

   Two things this gets right that it previously did not:

   1. The SENDER'S OWN SONG is played. A gift carries it as `songUrl`, and
      nothing in the story ever read that field, so an uploaded track was
      silently discarded and everyone got the default instead. It is checked
      first now, and the bundled theme is only the fallback.

   2. The fallback path is resolved against THIS SCRIPT'S location rather than
      the page's. The standalone copy is served from the repository root, where
      "assets/music/theme.mp3" is right; a gift is served from /g/<slug>,
      where the same relative path asks for /g/assets/music/theme.mp3 and
      404s. Deriving it from the script URL is correct in both.

   If there is no track at all the toggle just stays inert — no console
   errors, no crash: the page has to keep working when media is missing.
   ========================================================================== */

(function () {
  // Captured at load time: document.currentScript is only set while the
  // script is being evaluated, not later inside initAudio().
  const here = (document.currentScript && document.currentScript.src) || "";
  const base = here.replace(/[^/]*$/, "");
  const DEFAULT_SRC = base ? base + "../assets/music/theme.mp3" : "assets/music/theme.mp3";

  /** The gift's own song if it has one, otherwise the bundled theme. */
  function resolveSource() {
    const given =
      (window.GIFT_OVERRIDE && window.GIFT_OVERRIDE.songUrl) ||
      (window.STORY && window.STORY.songUrl);
    return given || DEFAULT_SRC;
  }

  let audioEl = null;
  let playing = false;
  let audioAvailable = true;

  function initAudio() {
    audioEl = document.getElementById("bg-audio");
    if (!audioEl) return;
    audioEl.src = resolveSource();
    audioEl.loop = true;
    audioEl.volume = 0.55;
    audioEl.addEventListener("error", () => { audioAvailable = false; }, { once: true });

    const toggle = document.getElementById("music-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", () => {
      if (!audioAvailable) return;
      playing ? pause() : play();
    });
  }

  function play() {
    if (!audioEl || !audioAvailable) return;
    audioEl.play().then(() => {
      playing = true;
      updateToggleLabel();
    }).catch(() => {
      // Autoplay/interaction restrictions or missing file — fail silently,
      // the rest of the experience must keep working regardless.
      audioAvailable = false;
      updateToggleLabel();
    });
  }

  function pause() {
    if (!audioEl) return;
    audioEl.pause();
    playing = false;
    updateToggleLabel();
  }

  function updateToggleLabel() {
    const toggle = document.getElementById("music-toggle");
    const label = document.querySelector("#music-toggle .label");
    const note = document.querySelector("#music-toggle .note");
    if (!toggle || !label || !note) return;

    // The control is an icon now, so its state lives in classes for the eye
    // and in the visually-hidden label plus aria-pressed for everyone else.
    if (!audioAvailable) {
      toggle.classList.add("is-unavailable");
      toggle.classList.remove("is-playing");
      toggle.setAttribute("aria-pressed", "false");
      toggle.setAttribute("aria-label", "Background music unavailable");
      label.textContent = "Music unavailable";
      note.textContent = "♪";
      return;
    }

    toggle.classList.remove("is-unavailable");
    toggle.classList.toggle("is-playing", playing);
    toggle.setAttribute("aria-pressed", playing ? "true" : "false");
    toggle.setAttribute("aria-label", playing ? "Turn background music off" : "Turn background music on");
    label.textContent = playing ? "Music On" : "Music Off";
    note.textContent = "♪";
  }

  // Called once from main.js right after the "Start Our Story" click —
  // this is the single user-interaction gesture that unlocks audio.
  window.tryStartMusic = function () {
    if (!audioEl) return;
    play();
  };

  window.initAudio = initAudio;
})();
