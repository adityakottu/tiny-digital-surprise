# Optional 3D character models

The hologram couple is built procedurally in `js/hologram.js`, so **nothing
here is required** — the scene works out of the box and weighs a few KB.

Drop in real models only if you want to replace the silhouettes:

    male-hologram.glb
    female-hologram.glb

Then pass them when the scene starts (see `loadHologramCharacters()` in
`js/hologram.js`):

    initHologramScene(canvas, {
      models: {
        male: "assets/3d/male-hologram.glb",
        female: "assets/3d/female-hologram.glb",
      },
    });

Loading a GLB also needs `GLTFLoader.module.js` vendored next to
`three.module.min.js`; the import in `loadHologramCharacters()` is already
wired for it and fails soft to the procedural figures if it is missing.

## Keep them small

This page is opened on phones, often over mobile data, and the hologram
already costs ~133 KB gzipped for Three.js itself. Before committing a model:

* Compress geometry with Draco or Meshopt.
* Keep textures out entirely if you can — the hologram shader ignores them,
  so a textureless mesh renders identically and saves the whole texture
  budget.
* Aim for well under 1 MB for the pair.

Anything that fails to load falls back to the procedural figures with a
console warning, so a bad asset degrades rather than breaks the story.
