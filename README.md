# Tiny Digital Surprise — Interactive Scroll Love Story

A cinematic, scroll-controlled love story. Plain HTML/CSS/JS + GSAP
ScrollTrigger — no framework, no build step. Works as-is on GitHub Pages.

## Run it locally

No build tools needed. From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly via `file://` also mostly works, except the
photo `<img>` tags may be blocked by some browsers' local file security —
serving it, even just with the command above, avoids that.)

## Deploy to GitHub Pages

1. Push this whole folder to a GitHub repo.
2. Repo → Settings → Pages → Deploy from branch → pick `main` and `/ (root)`.
3. Your site goes live at `https://<username>.github.io/<repo>/`.

Nothing else to configure — GSAP is vendored locally in `js/vendor/`, so
there's no CDN dependency and no build step.

## What to edit (you should never need to touch animation code)

Everything content-related lives in **`js/story.js`**:

- `storyScenes` — the narration lines that appear during the scroll story,
  and *when* (0–1 scroll progress) each one appears.
- `memoryPhotos` — your photo filenames (drop images into
  `assets/photos/`, keep the same names or update the `src` values),
  where each one flies in, and its caption.
- `timelineMilestones` — the six relationship-timeline entries.
- `finalMessage` — the closing lines, your personal message, and the
  "One More Thing…" bonus text.
- `backgroundScenes` — the six background colour scenes and where each
  starts crossfading in.

## Add your own photos

Replace the placeholder files in `assets/photos/` (`memory-01.jpg` …
`memory-04.jpg`) with your own — same filenames, or update `story.js` to
point at new ones. If a photo is missing, the page shows a soft heart
placeholder instead of a broken-image icon, so it never looks broken.

## Add music (optional)

Drop an MP3 at `assets/music/theme.mp3`. The music toggle only appears
after the visitor taps "Start Our Story" (required by mobile browsers —
audio cannot autoplay), and if no file is present the button simply reads
"Music unavailable" instead of erroring.

## How the scroll story works

`js/animations.js` builds **one** GSAP timeline pinned to `#scene-story`
with `scrollTrigger: { scrub: 1, pin: true }`. Scroll position literally
*is* the timeline's playhead — nothing plays on a timer, and scrolling up
runs the whole sequence in reverse automatically (it's the same timeline,
just scrubbed backwards). The character choreography follows the exact
beats requested: 0% apart → 20% walking → 40% meet → 50% look at each
other → 60% hold hands → 75% closer → 90% hug → 100% next chapter.

## Characters

Both characters are hand-built SVG (`index.html`), not images, so they're
resolution-independent and tiny in file size. Each has independently
animatable parts (`boy-head`, `boy-left-arm`, `boy-right-arm`, `boy-left-leg`,
`boy-right-leg`, `boy-body`, and the matching `girl-*` ids), so you can
extend the choreography or add new poses without redrawing anything.

## Performance & accessibility

- Only `transform`/`opacity` are animated during scroll (no layout thrash).
- `prefers-reduced-motion` is respected: the pinned scroll choreography is
  skipped entirely and replaced with a simple, fully-readable static
  layout with the story still complete top to bottom.
- Photos are `loading="lazy"`.
- Tested at 375 / 390 / 414 / 768 / 1024 / 1440px — no horizontal overflow
  at any of them.

## File structure

```
index.html
css/style.css          base layout, colours, components
css/animations.css     idle loops (blink, breathe, hover, particles)
css/responsive.css     breakpoints
js/story.js            <- all editable content lives here
js/animations.js       GSAP ScrollTrigger choreography (reads story.js)
js/audio.js            music toggle, gated on user interaction
js/interactions.js     micro-interactions (particles, tilt, heart taps)
js/main.js             boot sequence (loading → opening → story)
js/vendor/             GSAP + ScrollTrigger, vendored (no CDN dependency)
assets/photos/         your memory photos
assets/music/          optional background track
assets/characters/     (reserved — characters are inline SVG in index.html)
assets/backgrounds/    (reserved — current backgrounds are CSS gradients)
```
