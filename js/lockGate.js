/* ==========================================================================
   lockGate.js — the PIN gate for the STANDALONE copy of the story.

   READ THIS BEFORE RELYING ON IT.

   This copy has no server. Everything it knows lives in files the browser
   downloads, which means the PIN is in the page source and anyone who opens
   developer tools — or just views source — can read it and walk straight in.
   It is a curtain, not a lock: enough to stop a casual glance spoiling the
   surprise, useless against anyone actually trying.

   The gift links created through the site are a different thing entirely.
   Those are checked on the server and the story is not sent at all until the
   PIN is right (see lib/giftPin.ts). If you need a real lock, send one of
   those.

   Off by default. Turn it on in story.js:

       lock: { enabled: true, pin: "2512", hint: "Your birthday — 4 digits" }
   ========================================================================== */

(function () {
  "use strict";

  function normalise(v) {
    return String(v || "")
      .normalize("NFKD")
      .replace(/[^0-9a-zA-Z]/g, "")
      .toLowerCase();
  }

  window.initLockGate = function () {
    var cfg = (window.STORY && window.STORY.lock) || {};
    if (!cfg.enabled || !cfg.pin) return;

    var expected = normalise(cfg.pin);
    if (expected.length < 4) {
      console.warn("[lockGate] PIN is too short to be worth showing — gate skipped.");
      return;
    }

    // Remember an unlock for this browser, so a reader who refreshes or comes
    // back later is not asked again.
    var KEY = "tds_unlocked";
    try {
      if (window.localStorage.getItem(KEY) === expected) return;
    } catch (e) {
      /* private mode — just ask again */
    }

    var hint = cfg.hint || expected.length + " characters";

    var gate = document.createElement("div");
    gate.className = "lock-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-label", "This gift is locked");
    gate.innerHTML =
      '<div class="lock-gate__inner">' +
      '<div class="lock-gate__icon" aria-hidden="true">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
      '<rect x="4" y="10.5" width="16" height="10" rx="2.5"/>' +
      '<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg></div>' +
      '<h1 class="lock-gate__title">Someone made you something</h1>' +
      '<p class="lock-gate__sub">It&rsquo;s locked until you put in the PIN they chose.</p>' +
      '<p class="lock-gate__hint"></p>' +
      '<form class="lock-gate__form" novalidate>' +
      '<input class="lock-gate__input" type="text" inputmode="numeric" autocomplete="off" ' +
      'autocapitalize="off" spellcheck="false" enterkeyhint="go" maxlength="32" aria-label="PIN">' +
      '<button class="lock-gate__btn" type="submit">Unlock</button>' +
      '<p class="lock-gate__err" role="status" aria-live="polite"></p>' +
      "</form></div>";

    gate.querySelector(".lock-gate__hint").textContent = hint;
    var dots = Math.min(Math.max(expected.length, 4), 12);
    gate.querySelector(".lock-gate__input").placeholder = new Array(dots + 1).join("•");

    document.body.appendChild(gate);
    document.body.classList.add("no-scroll");

    var input = gate.querySelector(".lock-gate__input");
    var err = gate.querySelector(".lock-gate__err");
    input.focus();

    // Keep focus inside the gate while it is up, so tabbing cannot reach the
    // story behind it.
    gate.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var focusable = gate.querySelectorAll("input, button");
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    gate.querySelector(".lock-gate__form").addEventListener("submit", function (e) {
      e.preventDefault();
      var given = normalise(input.value);
      if (!given) { err.textContent = "Put the PIN in first."; return; }
      if (given !== expected) {
        err.textContent = "That PIN isn't right.";
        gate.classList.add("is-wrong");
        setTimeout(function () { gate.classList.remove("is-wrong"); }, 500);
        input.select();
        return;
      }
      try { window.localStorage.setItem(KEY, expected); } catch (e2) { /* fine */ }
      gate.classList.add("is-open");
      document.body.classList.remove("no-scroll");
      setTimeout(function () {
        if (gate.parentNode) gate.parentNode.removeChild(gate);
        // The story locks scroll itself until "Enter Our Story" is pressed,
        // so hand control back rather than assuming it should be scrollable.
        var opening = document.getElementById("opening-screen");
        if (opening && !opening.classList.contains("hidden")) {
          document.body.classList.add("no-scroll");
        }
      }, 620);
    });
  };
})();
