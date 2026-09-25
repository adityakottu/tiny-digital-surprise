# Faces for the holographic couple

The two figures in the hologram chapter can wear real faces. A photo is
converted to luminance and re-tinted into each figure's own hologram palette,
so it reads as *their face made of light* rather than a passport photo stuck
onto a model.

Everything here is optional. With no photos the figures keep their plain
hologram heads, and nothing else changes.

## What photo to use

Passport-style is exactly right:

* face centred and filling most of the frame
* looking straight at the camera
* even lighting, plain background
* square-ish crop (the projection samples a centred square)
* JPEG or PNG, at least 400x400, under 8MB

Sunglasses, heavy shadow, or a face small in a wide shot will not read well —
the projection has only the front of the head to work with.

## Setting them

**On a gift created through the site**, the sender uploads both photos in the
create form ("Your faces in the hologram"). They are stored with the gift and
passed through automatically. Nothing to configure.

**On the standalone copy** (no backend), point the section at local files:

```html
<section id="scene-hologram"
         data-face-male="assets/faces/him.jpg"
         data-face-female="assets/faces/her.jpg">
```

Or set them on the story config, which takes precedence:

```js
window.STORY.identity.senderPhoto    = "assets/faces/him.jpg";
window.STORY.identity.recipientPhoto = "assets/faces/her.jpg";
```

## If a photo fails to load

The figure keeps its plain hologram head and a warning goes to the console.
A missing, blocked or corrupt photo never breaks the scene.

One thing to watch: photos served from another domain need CORS to allow it,
because the texture is read by WebGL. Same-origin files (anything in this
folder) are always fine.
