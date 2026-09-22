/* ==========================================================================
   audio.js — optional background music, gated behind user interaction.
   Drop an mp3/ogg into /assets/music/ and set AUDIO_SRC below. If no file
   is present the toggle simply stays inert (no console errors, no crash) —
   the spec requires the page to keep working when media is missing.
   ========================================================================== */

(function () {
  const AUDIO_SRC = "assets/music/theme.mp3"; // replace with your track
  let audioEl = null;
  let playing = false;
  let audioAvailable = true;

  function initAudio() {
    audioEl = document.getElementById("bg-audio");
    if (!audioEl) return;
    audioEl.src = AUDIO_SRC;
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
    const label = document.querySelector("#music-toggle .label");
    const note = document.querySelector("#music-toggle .note");
    if (!label || !note) return;
    if (!audioAvailable) {
      label.textContent = "Music unavailable";
      note.textContent = "♪";
      return;
    }
    label.textContent = playing ? "Music On" : "Music Off";
    note.textContent = playing ? "♫" : "♪";
  }

  // Called once from main.js right after the "Start Our Story" click —
  // this is the single user-interaction gesture that unlocks audio.
  window.tryStartMusic = function () {
    if (!audioEl) return;
    play();
  };

  window.initAudio = initAudio;
})();
