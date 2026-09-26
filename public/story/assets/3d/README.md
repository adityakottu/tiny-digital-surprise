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


## What the loader can rig

Two model shapes are supported:

**A rigged model** — a skeleton with skinned meshes, optionally with animation
clips. Clips get an `AnimationMixer` and play alongside the scroll
choreography.

**Flat named parts** — one mesh per body part, all siblings, geometry baked in
world space, no skeleton. This is what procedural exporters (trimesh, most
Blender scripts) produce. The loader builds the missing skeleton by deriving
each pivot from the parts' own bounding boxes: a shoulder is the top of the
upper arm, an elbow is where upper and lower arm meet, a knee likewise. Name
the parts like this:

    Male_Head        Male_Torso        Male_Hip
    Male_LeftUpperArm  Male_LeftLowerArm  Male_LeftHand
    Male_LeftUpperLeg  Male_LeftLowerLeg
    Female_…  (same, plus Female_Dress)

Z-up models are detected and converted; the figure is scaled and stood on the
floor automatically.

## Judge a model before you ship it

A `.glb` is not automatically an upgrade. The procedural couple is reasonably
well proportioned, so a model has to beat it, and a small procedurally
generated one usually will not — oversized heads, box torsos and detached
limbs look worse in the scene than the built-in figures do.

Render the file on its own before wiring it in. If the silhouette does not
read clearly as a person at thumbnail size, it will not read as a hologram
either, because the shader keeps only the edges and a faint interior.

What actually helps: a proper rig, sensible human proportions, and limbs that
join. Texture detail does not, since the hologram shader discards it.
